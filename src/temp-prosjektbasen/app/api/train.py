# app/api/train.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime
import shutil
import csv
import joblib
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression  # stabil, fungerer bra
from sklearn.svm import LinearSVC  # alternativ

from app.tasks import verify_and_load_models, FAG_MODEL_PATH

router = APIRouter(prefix="/train", tags=["train"])


class TrainFromRunIn(BaseModel):
    run_id: str
    algo: str | None = "logreg"         # "logreg" eller "linearsvc"
    min_df: int | None = 2              # TF-IDF min_df
    ngram_max: int | None = 2           # 1..2 er fint for norsk
    lower: bool | None = True


@router.post("/from-run")
def train_from_run(body: TrainFromRunIn):
    run_dir = Path("app/temp") / body.run_id
    csv_path = run_dir / "trainset.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Fant ikke {csv_path}")

    texts, labels = [], []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            # forventer kolonner: text, keep, gruppe, label, note, ref ...
            keep = str(row.get("keep", "")).strip().lower() in ("true", "1", "yes", "ja")
            grp = (row.get("gruppe") or "").strip()
            txt = (row.get("text") or "").strip()
            if keep and grp and txt:
                texts.append(txt)
                labels.append(grp)

    if len(texts) < 2:
        raise HTTPException(status_code=400, detail="For få eksempler (min 2 med keep=true og gruppe).")

    # Modellpipeline
    vec = TfidfVectorizer(
        lowercase=bool(body.lower),
        ngram_range=(1, int(body.ngram_max or 2)),
        min_df=int(body.min_df or 2),
    )

    if (body.algo or "logreg").lower() == "linearsvc":
        clf = LinearSVC()
    else:
        clf = LogisticRegression(max_iter=200, n_jobs=None)

    pipe = Pipeline([("tfidf", vec), ("clf", clf)])
    pipe.fit(texts, labels)

    artefact = {
        "pipeline": pipe,
        "labels": sorted(set(labels)),
        "meta": {
            "n_samples": len(texts),
            "algo": (body.algo or "logreg").lower(),
            "source": str(csv_path),
        },
    }
    FAG_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if FAG_MODEL_PATH.exists():
        bkp = FAG_MODEL_PATH.with_name(
            f"fag_profiler_{datetime.now():%Y%m%d_%H%M%S}.pkl"
        )
        shutil.copy2(FAG_MODEL_PATH, bkp)
    joblib.dump(artefact, FAG_MODEL_PATH)

    # last inn i minnet uten restart
    verify_and_load_models()

    return {
        "ok": True,
        "saved_to": str(FAG_MODEL_PATH),
        "classes": sorted(set(labels)),
        "n_samples": len(texts),
    }


@router.post("/reload")
def reload_model():
    verify_and_load_models()
    return {"ok": True, "reloaded": True}
