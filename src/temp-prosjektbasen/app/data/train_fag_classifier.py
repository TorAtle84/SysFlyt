# app/train_fag_classifier.py
# -*- coding: utf-8 -*-
"""
Trener fag-modellen fra krav_med_domener.csv og lagrer en data-artefakt uten __main__-referanser.

Input:
- app/data/krav_med_domener.csv  (kolonner: tekst, fag|label|gruppe)

Output:
- app/data/fag_profiler.pkl      (dict: model, labels, thresholds, meta)
- app/data/fag_training_report.txt
- app/data/fag_profiler_meta.json
"""
from __future__ import annotations

import csv
import json
import time
import os
import sys
import collections
from pathlib import Path
from typing import Tuple, List

import numpy as np
import joblib

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    classification_report,
    accuracy_score,
    f1_score,
    precision_recall_fscore_support,
)

# ——— Prosjektstier/konstanter ———
try:
    from app.training_logic import DATA_DIR, PKL_FAG_PROFILER  # type: ignore
except Exception:
    APP_DIR = Path(__file__).resolve().parent
    DATA_DIR = APP_DIR / "data"
    PKL_FAG_PROFILER = DATA_DIR / "fag_profiler.pkl"

ROOT_DIR = Path(__file__).resolve().parent.parent  # ...\app
if str(ROOT_DIR.parent) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR.parent))

# NB: bruk samme normalisering som i runtime
from app.ml.text_utils import normalize_text  # viktig: ikke __main__


# ---------------------------
# CSV-lesing med kolonne-auto
# ---------------------------
def _read_labeled_rows(csv_path: Path) -> Tuple[List[str], List[str]]:
    """
    Leser tekst og label fra CSV. Aksepterer ; eller , som separator.
    Oppdager kolonner: tekst|text|kravtekst  og  fag|label|gruppe
    """
    if not csv_path.is_file():
        raise FileNotFoundError(f"Mangler treningskilde: {csv_path}")

    raw = csv_path.read_text(encoding="utf-8", errors="ignore")
    delimiter = ";" if raw.count(";") > raw.count(",") else ","

    X: List[str] = []
    y: List[str] = []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        if not reader.fieldnames:
            raise ValueError(f"Ingen kolonneheader funnet i {csv_path}")

        cols = {k.lower(): k for k in reader.fieldnames}
        text_col = cols.get("tekst") or cols.get("text") or cols.get("kravtekst")
        if not text_col:
            # fallback: ta første kolonne
            text_col = list(cols.values())[0]

        label_col = cols.get("fag") or cols.get("label") or cols.get("gruppe")
        if not label_col:
            raise ValueError(f"Fant ikke kolonne for label i {csv_path}. Forventet 'fag'/'label'/'gruppe'.")

        for row in reader:
            t = (row.get(text_col) or "").strip()
            l = (row.get(label_col) or "").strip()
            if t and l:
                X.append(normalize_text(t))
                y.append(l)

    if not X:
        raise ValueError(f"Ingen treningsrader lest fra {csv_path}")
    return X, y


# ---------------------------
# Pipeline + kalibrering
# ---------------------------
def _build_base_pipeline() -> Pipeline:
    """
    TF-IDF (1–2-gram) + LogisticRegression(saga, balanced).
    Ingen custom analyzers => trygt å pickle.
    """
    vec = TfidfVectorizer(
        ngram_range=(1, 2),
        analyzer="word",
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,
    )
    clf = LogisticRegression(
        solver="saga",
        max_iter=2000,
        n_jobs=-1,
        verbose=0,
        class_weight="balanced",
        random_state=42,
    )
    return Pipeline([("tfidf", vec), ("clf", clf)])


def _tune_thresholds(y_true: np.ndarray, proba: np.ndarray, n_classes: int) -> List[float]:
    """
    Finn beste terskel pr. klasse (one-vs-rest) på valideringssettet ved å maksimere F1.
    Fallback = 0.45 hvis datagrunnlaget er for tynt.
    """
    if proba is None or proba.shape[0] == 0:
        return [0.45] * n_classes

    thresholds: List[float] = []
    base_grid = np.linspace(0.20, 0.90, 15)

    for k in range(n_classes):
        y_pos = (y_true == k).astype(int)
        s = proba[:, k]
        if y_pos.sum() < 3:
            thresholds.append(0.45)
            continue

        # miks av kvantiler + jevn grid for robust søk
        qs = np.quantile(s, [0.20, 0.35, 0.50, 0.65, 0.80, 0.90])
        grid = np.unique(np.clip(np.concatenate([base_grid, qs]), 0.05, 0.99))

        best_t, best_f1 = 0.45, -1.0
        for t in grid:
            y_hat = (s >= t).astype(int)
            _, _, f1, _ = precision_recall_fscore_support(
                y_pos, y_hat, average="binary", zero_division=0
            )
            if f1 > best_f1:
                best_f1, best_t = float(f1), float(t)
        thresholds.append(best_t)

    return thresholds


def train_and_dump() -> dict:
    DATA_DIR_PATH = Path(DATA_DIR)
    DATA_DIR_PATH.mkdir(parents=True, exist_ok=True)
    csv_path = DATA_DIR_PATH / "krav_med_domener.csv"
    model_path = Path(PKL_FAG_PROFILER)

    # 1) Les data
    X_raw, y_raw = _read_labeled_rows(csv_path)

    # 2) Filtrer ut 1-forekomst-klasser (ustabilt å trene på)
    label_counts = collections.Counter(y_raw)
    safe_labels = {label for label, count in label_counts.items() if count > 1}
    excluded_labels = [label for label, count in label_counts.items() if count <= 1]

    if excluded_labels:
        print("WARN: Følgende 'fag' har for få eksempler (<=1) og ekskluderes:")
        for label in excluded_labels:
            print(f"WARN: - {label} ({label_counts[label]} eksempel)")
        X = [t for t, l in zip(X_raw, y_raw) if l in safe_labels]
        y = [l for l in y_raw if l in safe_labels]
        if len(set(y)) < 2:
            raise ValueError("Etter filtrering er det <2 'fag' igjen. Kan ikke trene.")
    else:
        X, y = X_raw, y_raw

    # 3) Label-encode
    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    # 4) Train/val-splitt
    try:
        X_tr, X_te, y_tr, y_te = train_test_split(
            X, y_enc, test_size=0.2, random_state=42, stratify=y_enc
        )
    except ValueError as e:
        print(f"WARN: Stratifisert split feilet ({e}). Faller tilbake til vanlig split.")
        X_tr, X_te, y_tr, y_te = train_test_split(
            X, y_enc, test_size=0.2, random_state=42, stratify=None
        )

    # 5) Base pipeline
    base_pipe = _build_base_pipeline()

    # 6) Kalibrer sannsynligheter med stratified CV
    #    (Robust: unngå lekkasje ved å bruke CV på treningssettet)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cal_model = CalibratedClassifierCV(
        estimator=base_pipe,
        method="sigmoid",  # isotonic krever mer data; 'sigmoid' er robust nå
        cv=cv,
    )

    # 7) Fit (kalibrert pipeline)
    cal_model.fit(X_tr, y_tr)

    # 8) Evaluer på HOLD-OUT (X_te)
    y_pred = cal_model.predict(X_te)
    acc = float(accuracy_score(y_te, y_pred))
    f1m = float(f1_score(y_te, y_pred, average="macro", zero_division=0))
    report_txt = classification_report(
        y_te, y_pred, target_names=le.classes_, digits=3, zero_division=0
    )
    (DATA_DIR_PATH / "fag_training_report.txt").write_text(report_txt, encoding="utf-8")

    # 9) Terskler pr klasse (basert på KALIBRERTE proba)
    proba_te = cal_model.predict_proba(X_te)
    thresholds = _tune_thresholds(y_te, np.asarray(proba_te), n_classes=len(le.classes_))

    # 10) Lagre artefakt (ATOMISK)
    payload = {
        # Kalibrert pipeline (TF-IDF + LogReg) innpakket i CalibratedClassifierCV
        "model": cal_model,
        # String-labels i riktig rekkefølge
        "labels": le.classes_.tolist(),
        # Per-klasse terskler (tunet på hold-out, valgfritt å bruke i runtime)
        "thresholds": thresholds,
        # Meta for sporbarhet
        "meta": {
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "n_samples": len(X),
            "n_classes": len(le.classes_),
            "report_path": str((DATA_DIR_PATH / "fag_training_report.txt").resolve()),
            "source_csv": str(csv_path.resolve()),
            "version": 3,  # økt pga kalibrering
            "accuracy": acc,
            "f1_macro": f1m,
        },
    }

    tmp_path = model_path.with_suffix(".pkl.tmp")
    joblib.dump(payload, tmp_path, compress=("xz", 3))
    os.replace(tmp_path, model_path)

    # 11) Liten JSON-metafil for rask inspeksjon
    meta_out = dict(payload["meta"])
    meta_out["thresholds"] = thresholds
    (DATA_DIR_PATH / "fag_profiler_meta.json").write_text(
        json.dumps(meta_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return {"ok": True, "model_path": str(model_path.resolve()), "meta": payload["meta"]}


if __name__ == "__main__":
    res = train_and_dump()
    print(json.dumps(res, ensure_ascii=False, indent=2))
