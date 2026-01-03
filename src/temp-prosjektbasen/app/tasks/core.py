# app/tasks/core.py
# -*- coding: utf-8 -*-
"""
Kjernefunksjonalitet for kravsporing:
- NLP-rensing, splitting og beriking av tekst
- Klassifisering (fag/kravtype), validering og deduplisering
- Hjelpere for sortering, normalisering og referanse-sammenslåing

Merk:
- For å unngå sirkulær import mellom core <-> models, brukes LAZY import
  av `app.tasks.models` via _task_models().
"""

from __future__ import annotations

import os
import json
import logging
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np
from rapidfuzz.fuzz import partial_ratio, ratio as fuzz_ratio, token_set_ratio
from app.tasks.models import fag_predict

# Ikke importer modeller/statisk util her (kan gi sirkler / ModuleNotFound ved oppstart)
# Normalisering/konfig hentes defensivt under.

# ---------------------------------------------------------------------------
# Konfig
# ---------------------------------------------------------------------------
_log = logging.getLogger(__name__)

# Standard-verdier som kan overskrives av EXTRACT_CFG i runtime
EXTRACT_CFG: Dict[str, Any] = {
    "kw_strong": 75,          # trigger for kontekst-sammenslåing
    "sem_strong": 62,         # trigger for kontekst-sammenslåing
    "w_kw": 0.55,             # vekt for kw_sc i fallback
    "w_sem": 0.50,            # vekt for sem_sc i fallback
    "w_ai": 0.60,             # vekt for ai_sc i fallback
    "w_kw_sem_combo": (0.55, 0.60),  # kombinasjon når begge er gode
    "focus_boost_hit": 10,
    "focus_boost_alias": 5,
    "focus_threshold": 0.55,  # andel fokusord som må treffe (når AI brukes)
    "min_score_default": 60,
    "ns_hit_min": 60,         # min NS-score for å ta med i ns_treff
    "ns_hits_per_std": 2,
    "dedup_threshold": 92,
}

GUARDED_PREVIEW_LOW_THR = 60.0   # lav terskel for "usikre" funn (kun Review)
EXPLAIN_TOPK = 3    

# ---------------------------------------------------------------------------
# Lazy imports / fallbacks
# ---------------------------------------------------------------------------
def _task_models():
    """
    Returnerer modul-objektet `app.tasks.models` på en trygg måte.
    Dersom import feiler, returneres et "tomt" objekt med forventede attributter.
    """
    try:
        import sys
        mod = sys.modules.get("app.tasks.models")
        if mod is not None:
            return mod
        from app.tasks import models as _m  # type: ignore
        return _m
    except Exception:
        class _Dummy:
            fag_model = None
            krav_validator_model = None
            nlp = None
            SYNONYM_PATH = Path("app/data/synonyms.json")
            semantic_model = None
            NS_CACHE_PATH = None

            # Fallback API for fag-modellen:
            @staticmethod
            def get_fag_model():
                return None

            @staticmethod
            def fag_predict(text: str) -> Dict[str, Any]:
                return {"ok": False}

            @staticmethod
            def reload_fag_model():
                return None

        return _Dummy()


def _try_import_config():
    """
    Henter konfig-objekter fra app.config defensivt.
    Returnerer nødvendige komponenter med forutsigbare fallbacks.
    """
    try:
        from app.config import DOMAIN_PROFILES, GLOBAL_OBLIGATION_VERBS, PDF_STANDARDER, UNITS_REGEX, regex_patterns
        return DOMAIN_PROFILES, GLOBAL_OBLIGATION_VERBS, PDF_STANDARDER, UNITS_REGEX, regex_patterns
    except Exception:
        # Fallbacks for minimal drift
        DOMAIN_PROFILES = {
            "generic": {
                "aliases": [],
                "terms": [],
                "units_re": re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(?:°\s*C|m3/s|m³/s|m2|m²|Pa|kPa|ppm)\b", re.I),
            }
        }
        GLOBAL_OBLIGATION_VERBS = ["skal", "må", "forutsettes", "leveres", "etableres", "plasseres", "utstyres",
                                   "tilpasses", "legges", "dimensjoneres"]
        PDF_STANDARDER = {}
        UNITS_REGEX = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(?:°\s*C|m3/s|m³/s|m2|m²|Pa|kPa|ppm)\b", re.I)
        regex_patterns = {}
        return DOMAIN_PROFILES, GLOBAL_OBLIGATION_VERBS, PDF_STANDARDER, UNITS_REGEX, regex_patterns


DOMAIN_PROFILES, GLOBAL_OBLIGATION_VERBS, PDF_STANDARDER, UNITS_REGEX, _REGEX_PATTERNS = _try_import_config()


def _normalize_text_fallback(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s.lower()


def _normalize_text(s: str) -> str:
    """Prøv å bruke app.ml.text_utils.normalize_text, ellers en enkel fallback."""
    try:
        from app.ml.text_utils import normalize_text as _ext_norm  # type: ignore
        return _ext_norm(s)
    except Exception:
        return _normalize_text_fallback(s)


# ---------------------------------------------------------------------------
# Felles konstanter og normaliseringshjelpere
# ---------------------------------------------------------------------------
BASE_GROUPS = [
    "elektro", "ventilasjon", "rørlegger", "byggautomasjon", "kulde",
    "totalentreprenør", "byggherre", "økonomi",
]

def _norm_key(s: Any) -> str:
    try:
        return " ".join(str(s or "").split()).strip().lower()
    except Exception:
        return ""


def _score_val(x: Dict[str, Any]) -> float:
    for k in ("score", "treff", "treff_prosent", "Treff %", "match_score"):
        v = x.get(k)
        if v is not None:
            try:
                return float(v)
            except (ValueError, TypeError):
                pass
    return -1.0


def _sort_requirements(reqs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def _kw(x):
        for k in ("keyword", "søkeord", "sokeord", "key"):
            if k in x:
                return _norm_key(x.get(k))
        return _norm_key("")
    return sorted(reqs, key=lambda x: (_kw(x), -_score_val(x)))


def _canon_group_name(name: str) -> str:
    if not name:
        return "Uspesifisert"
    key = name.strip().lower()
    alias = {"alle fag": "__ALL__", "rør": "rørlegger", "uspesifisert": "Uspesifisert"}
    if key in alias:
        return alias[key]
    return key


def _base_group(name: str) -> str:
    if not name:
        return "Uspesifisert"
    s = name.strip().lower()
    for g in BASE_GROUPS:
        if g in s:
            return g
    return _canon_group_name(name)


def _normalize_selected_groups(selected_groups: Iterable[str] | None) -> List[str]:
    if not selected_groups:
        return []
    norm = {_canon_group_name(g) for g in selected_groups if isinstance(g, str) and g.strip()}
    if "__ALL__" in norm and len(norm) > 1:
        norm.discard("__ALL__")
    return sorted(norm)


# ---------------------------------------------------------------------------
# Tekstrensing
# ---------------------------------------------------------------------------
def clean_text(text: str) -> str:
    t = text or ""
    t = re.sub(r'[\x00-\x1F\x7F]', '', t)
    t = t.replace('\r\n', '\n').replace('\r', '\n')
    t = re.sub(r'(Fra:|Sendt:|Til:|Kopi:|Emne:)\s*', r'\n\1 ', t, flags=re.IGNORECASE)
    t = re.sub(r'(\b[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\bhttps?://\S+|\bwww\.\S+)',
               r'\1\n', t, flags=re.IGNORECASE)
    t = re.sub(r'(P\.O\.Box|Telephone|Mobile|Tlf:)\s*', r'\n\1 ', t, flags=re.IGNORECASE)
    t = re.sub(r'^\s*([._-]{3,}|\*{3,}|={3,}|#{3,})\s*$', '', t, flags=re.MULTILINE)
    t = re.sub(r'^\s*(\d\s*){1,5}$', '', t, flags=re.MULTILINE)
    t = re.sub(r'(\S)\s*(\.{2,}|\-{2,})\s*(\d)', r'\1 \3', t)
    t = re.sub(r'(\w)-\s*\n\s*(\w)', r'\1\2', t, flags=re.IGNORECASE)
    t = re.sub(r'(?<!\n)\n(?!\n)', ' ', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    t = re.sub(r'[ \t]+', ' ', t).strip()
    t = re.sub(r'([a-zæøå])([A-ZÆØÅ])', r'\1 \2', t)
    t = re.sub(r'\s([,.?!;])', r'\1', t)
    t = re.sub(r'[ \t]+', ' ', t).strip()
    return t


# ---------------------------------------------------------------------------
# Klassifisering og validering
# ---------------------------------------------------------------------------
def _fallback_group(text: str) -> Tuple[str, List[Tuple[str, float]]]:
    low = (text or "").lower()
    rules = [
        ("Rørlegger",      r"\b(pumpe|sirkulasjonspumpe|varmepumpe|sprinkler|tappevann|sanitær)\b"),
        ("Ventilasjon",    r"\b(vifte|vifter|ventilasjon|vav|cav|tilluft|avtrekk|kanal|filterklasse|sfp)\b"),
        ("Byggautomasjon", r"\b(sd[- ]?anlegg|bacnet|modbus|trend|alarmer|io[- ]?liste)\b"),
        ("Elektro",        r"\b(tavle|kursfortegnelse|overspenningsvern|nek ?400|stikk|belysning|jordfeil)\b"),
        ("Kulde",          r"\b(kulde|chiller|f-gass|kuldemedie|fordamper|kondensator|kompressor)\b"),
    ]
    for label, rx in rules:
        if re.search(rx, low):
            return label, [(label, 1.0)]
    return "Uspesifisert", []


def _get_fag_model():
    tm = _task_models()
    return getattr(tm, "get_fag_model", tm.get_fag_model)() if hasattr(tm, "get_fag_model") else getattr(tm, "fag_model", None)


def _fag_predict(text: str) -> Dict[str, Any]:
    tm = _task_models()
    fn = getattr(tm, "fag_predict", None)
    if callable(fn):
        try:
            return fn(text)
        except Exception:
            return {"ok": False}
    return {"ok": False}


def _reload_fag_model():
    tm = _task_models()
    fn = getattr(tm, "reload_fag_model", None)
    if callable(fn):
        try:
            fn()
        except Exception as e:
            _log.warning("Klarte ikke å reload'e fag-modellen: %s", e)


def classify_group_ai(text: str, min_score: float | None = None):
    """
    Returnerer (best_label_eller_None, rankliste) der rankliste = [(label, score_float), ...] sortert synkende.
    Bruker treningsartefaktet (pipeline + thresholds) hvis tilgjengelig; faller tilbake til fag_predict().
    """
    raw = text or ""
    txt = _normalize_text(raw)
    mdl = _get_fag_model()

    default_thr = 0.45 if min_score is None else float(min_score)

    # Ingen/ukjent modell → fallback til fag_predict
    if not isinstance(mdl, dict) or "pipeline" not in mdl or "labels" not in mdl:
        r = fag_predict(raw)
        label = r.get("label") if r.get("ok") and float(r.get("score", 0.0)) >= default_thr else None
        rank = [(str(r.get("label")), float(r.get("score", 0.0)))] if r.get("ok") else []
        return label, rank

    pipe = mdl["pipeline"]
    labels = list(mdl["labels"])
    thresholds_raw = mdl.get("thresholds", None)
    thresholds = _as_list_like(thresholds_raw, length=len(labels), default=default_thr)

    # predict_proba-vei
    if hasattr(pipe, "predict_proba"):
        proba = pipe.predict_proba([txt])
        # flatten trygt til 1D liste
        scores = _as_list_like(proba, default=0.0)
        # Hvis modellen ga flattened over alle klasser for 1 eksempel,
        # skal vi ha n_scores == len(labels); hvis ikke, prøv å hente første rad
        if len(scores) != len(labels):
            try:
                scores = _as_list_like(proba[0], default=0.0, length=len(labels))
            except Exception:
                scores = [0.0] * len(labels)

        rank = sorted(
            [(str(labels[i]), float(scores[i])) for i in range(len(labels))],
            key=lambda x: x[1],
            reverse=True,
        )
        best_label, best_score = rank[0]
        best_idx = next((i for i, lbl in enumerate(labels) if lbl == best_label), 0)
        thr = float(thresholds[best_idx]) if 0 <= best_idx < len(thresholds) else default_thr
        return (best_label if best_score >= thr else None), rank

    # Fallback uten proba: bruk predict + fag_predict for ca. score
    try:
        pred = pipe.predict([txt])
        idx_list = _as_list_like(pred, default=0.0)
        idx = int(idx_list[0]) if idx_list else 0
        best_label = str(labels[idx]) if 0 <= idx < len(labels) else str(idx)

        r = fag_predict(raw)
        approx_score = float(r.get("score", 1.0)) if r.get("ok") else 1.0
        rank = [(best_label, approx_score)]
        thr = float(thresholds[idx]) if 0 <= idx < len(thresholds) else default_thr
        return (best_label if approx_score >= thr else None), rank
    except Exception:
        r = fag_predict(raw)
        label = r.get("label") if r.get("ok") and float(r.get("score", 0.0)) >= default_thr else None
        rank = [(str(r.get("label")), float(r.get("score", 0.0)))] if r.get("ok") else []
        return label, rank


def is_valid_requirement(tekst: str) -> bool:
    tm = _task_models()
    words = len((tekst or "").split())
    if not getattr(tm, "krav_validator_model", None) or words < 4:
        return words >= 4
    try:
        pred = tm.krav_validator_model.predict([tekst])
        pred = np.asarray(pred).ravel()
        return int(pred[0]) == 1
    except Exception:
        return True


def classify_type(tekst: str) -> str:
    tl = (tekst or "").lower()
    for kravtype, patterns in _REGEX_PATTERNS.items():
        for pattern in patterns:
            try:
                if re.search(pattern, tl):
                    return kravtype
            except re.error:
                continue
    return "krav"

def _as_list_like(x, *, length: int | None = None, default=None) -> List[float]:
    """Trygg konvertering av thresholds/proba til flat Python-liste[float]."""
    try:
        import numpy as _np
    except Exception:
        _np = None

    if x is None:
        lst = []
    elif isinstance(x, (list, tuple)):
        lst = list(x)
    elif _np and 'numpy' in str(type(x)).lower():
        try:
            lst = list(_np.asarray(x).ravel().tolist())
        except Exception:
            lst = [float(x)]
    else:
        lst = [x]

    # cast -> float (med default når noe er None/NaN/feil)
    out: List[float] = []
    for v in lst:
        try:
            out.append(float(v))
        except Exception:
            out.append(float(default) if default is not None else 0.0)

    if length is not None:
        if len(out) < length:
            out = out + [float(default) if default is not None else 0.0] * (length - len(out))
        elif len(out) > length:
            out = out[:length]
    return out

def classify_group(tekst: str) -> str:
    tl = (tekst or "").lower()
    if "byggherre" in tl:
        return "byggherre"
    if "totalentreprenør" in tl:
        return "totalentreprenør"
    if any(w in tl for w in ["økonomi", "kostnad", "pris", "dagmulkt"]):
        if any(w in tl for w in ["elektro", "strøm", "kabel"]):
            return "elektro, økonomi"
        if any(w in tl for w in ["ventilasjon", "luft"]):
            return "ventilasjon, økonomi"
        if any(w in tl for w in ["rør", "sanitær", "vann"]):
            return "rørlegger, økonomi"
        if any(w in tl for w in ["sd", "bas", "byggautomasjon"]):
            return "byggautomasjon, økonomi"
        return "økonomi"
    if "prosjektering" in tl or "detaljprosjektering" in tl:
        if any(w in tl for w in ["elektro", "strøm", "kabel"]):
            return "elektro, prosjektering"
        if any(w in tl for w in ["ventilasjon", "luft"]):
            return "ventilasjon, prosjektering"
        if any(w in tl for w in ["rør", "sanitær", "vann"]):
            return "rørlegger, prosjektering"
        if any(w in tl for w in ["sd", "bas", "byggautomasjon"]):
            return "byggautomasjon, prosjektering"
        return "prosjektering"
    if any(w in tl for w in ["strøm", "kabel", "elektro", "sikring", "belysning", "brannalarm",
                             "adgangskontroll", "lys", "ups", "tavle", "solcelle", "energimåler",
                             "nettverk", "mast", "port", "telefon"]):
        return "elektro"
    if any(w in tl for w in ["luft", "ventilasjon", "avtrekk", "tilluft", "vav", "cav", "overstrøm",
                             "ventilering", "brannspjeld", "hette", "rist", "kanal", "batteriaggregat",
                             "røykavtrekk", "blikk", "inneklima", "sfp", "varmegjenvinning",
                             "kjølegjenvinning"]):
        return "ventilasjon"
    if any(w in tl for w in ["vann", "avløp", "sanitær", "rør", "sirkulasjon", "pumpe", "fettutskiller",
                             "bereder", "borrehull", "lekkasje", "sprinkler", "kaldras"]):
        return "rørlegger"
    if any(w in tl for w in ["sd", "bas", "byggautomasjon", "kontroller", "sd-anlegg", "program",
                             "regulering", "bus", "bacnet", "modbus", "autonom"]):
        return "byggautomasjon"
    if "gk" in tl:
        return "GK"
    if "bravida" in tl:
        return "Bravida"
    if "caverion" in tl:
        return "Caverion"
    if "vestrheim" in tl:
        return "Vestrheim"
    return "Uspesifisert"


# ---------------------------------------------------------------------------
# Hjelpere for beriking og splitting
# ---------------------------------------------------------------------------
def _generate_short_text(text: str, max_len: int = 120) -> str:
    if not text:
        return ""
    t = re.sub(r"\s+", " ", text).strip()
    parts: List[str] = []

    m = re.search(r"(DUT|dimensjonerende)\s*utetemperatur[^.;]*?(-?\d[.,]?\d*)\s*°\s*C", t, re.I)
    if m:
        parts.append(f"DUT {m.group(2)} °C")
    m = re.search(r"min(?:imum)?\s*utetemperatur[^.;]*?(-?\d[.,]?\d*)\s*°\s*C", t, re.I)
    if m:
        parts.append(f"Min. utetemp {m.group(1)} °C")
    m = re.search(r"maks(?:imal)?\s*tilluftstemperatur[^.;]*?(\d[.,]?\d*)\s*°\s*C", t, re.I)
    if m:
        parts.append(f"Maks tilluft {m.group(1)} °C")
    m = re.search(
        r"(operativ temperatur|romtemperatur)[^.;]*?(-?\d[.,]?\d*)\s*°\s*C(?:[^.;]*?(\d[.,]?\d*)\s*°\s*C)?",
        t, re.I,
    )
    if m:
        dash = f"–{m.group(3)}" if m.group(3) else ""
        parts.append(f"{m.group(1).title()} {m.group(2)}{dash} °C")
    m = re.search(r"((?:under|over)trykk|trykk(?:differanse|setting))[^.;]*?(-?\d[.,]?\d*)\s*(k?\s*Pa)", t, re.I)
    if m:
        parts.append(re.sub(r"\s+", " ", m.group(0)).strip(" .;"))
    m = re.search(r"CO[2₂][^.;]*?(\d[.,]?\d*)\s*ppm", t, re.I)
    if m:
        parts.append(f"CO₂ {m.group(1)} ppm")
    m = re.search(r"\bSFP\b[^.;]*?([<>]=?)\s*(\d[.,]?\d*)\s*(k?\s*W)\s*/\s*\(?\s*m\s*[³3]\s*/\s*s\)?", t, re.I)
    if m:
        parts.append(f"SFP {m.group(1)} {m.group(2)} kW/(m³/s)")
    m = re.search(r"varmegjenvinning[^.;]*?([<>]=?)\s*(\d{1,3})\s*%", t, re.I)
    if m:
        parts.append(f"Varmegjenvinning {m.group(1)} {m.group(2)} %")
    m = re.search(r"(\d[.,]?\d*)\s*m\s*[³3]\s*/\s*m\s*[²2]\s*/\s*t", t, re.I)
    if m:
        m2 = re.search(r"[^.;]*\d[.,]?\d*\s*m\s*[³3]\s*/\s*m\s*[²2]\s*/\s*t[^.;]*", t, re.I)
        if m2:
            parts.append(re.sub(r"\s+", " ", m2.group(0)).strip(" .;"))
    for term in [r"\bVAV[^.;]*", r"\bsekvensregulering[^.;]*"]:
        m = re.search(term, t, re.I)
        if m:
            parts.append(re.sub(r"\s+", " ", m.group(0)).strip(" .;"))

    summary = "; ".join(list(dict.fromkeys(p for p in parts if p))) or t.split(".")[0]
    return summary[:max_len] + ("..." if len(summary) > max_len else "")


def _has_verb(text: str) -> bool:
    tl = (text or "").lower()
    tm = _task_models()
    if getattr(tm, "nlp", None):
        try:
            return any(t.pos_ == "VERB" for t in tm.nlp(text))
        except Exception:
            pass
    return bool(re.search(r"\b(skal|må|kan|er|være|forutsettes|leveres|etableres|plasseres|utstyres|tilpasses|legges|dimensjoneres)\b", tl))


def _looks_incomplete(s: str) -> bool:
    tl = (s or "").strip().lower()
    if not tl:
        return True
    if tl.endswith((",", ";", ":", " og", " samt", " med", " for", " til", " på", " av", " i", " om")):
        return True
    if not _has_verb(tl) and len(tl) < 80:
        return True
    return False


def _starts_as_continuation(s: str) -> bool:
    tl = (s or "").lstrip()
    if not tl:
        return False
    if re.match(r"^(og|samt|samtidig|slik at|der|som)\b", tl.lower()):
        return True
    return bool(re.match(r"^(?:[a-zæøå])\b", tl.lower()))


def _contains_numbers_units_profile(s: str, profile: dict) -> bool:
    return bool(profile["units_re"].search(s.lower()))


def _enrich_clause(clauses: List[str], idx: int, profile: dict) -> Tuple[str, int]:
    """
    Slår sammen nabobiter til en mer komplett setning.
    Returnerer (sammenslått_tekst, antall_biter_brukt).
    """
    used = 1
    base = clauses[idx].strip()

    # evt. dra inn forrige bit som prefiks
    if (_looks_incomplete(base) or not _has_verb(base)) and idx - 1 >= 0:
        prev = clauses[idx - 1].strip()
        prev_ok = (_has_verb(prev) or any(t in prev.lower() for t in profile.get("terms", []))) and not _contains_numbers_units_profile(prev, profile)
        if prev_ok and len(prev) < 160:
            base = prev.rstrip(" .;") + ". " + base

    # dra inn påfølgende biter som fortsetter meningen
    j = idx + 1
    while j < len(clauses) and (_looks_incomplete(base) or _starts_as_continuation(clauses[j])):
        nxt = clauses[j].strip()
        if not nxt:
            break
        base = base.rstrip(" .;") + ". " + nxt
        used += 1
        j += 1

    # hvis fortsatt ikke tall/enheter, prøv å legge til én til
    if not _contains_numbers_units_profile(base, profile) and j < len(clauses):
        nxt = clauses[j].strip()
        if _contains_numbers_units_profile(nxt, profile):
            base = base.rstrip(" .;") + ". " + nxt
            used += 1

    base = re.sub(r"\s+", " ", base).strip().replace(", .", ".").replace(" ,", ",")
    if not base.endswith((".", ";")):
        base = base + "."
    return base, used


def _split_atomic_requirements(text: str) -> List[str]:
    if not text:
        return []
    t = text.replace("•", " • ").replace("·", " • ")
    parts = re.split(r'(?<=[.;])\s+|\n|\s*•\s*|\s*:\s*', t)
    re_lead = re.compile(
        r'\b(SFP|VAV|CO2|CO₂|varmegjenvinning|operativ temperatur|romtemperatur|tilluftstemperatur|'
        r'DUT|dimensjonerende utetemperatur|utetemperatur|luftmengde|sekvensregulering|tilluft|'
        r'avtrekk|undertrykk|overtrykk|trykkdifferanse|differansetrykk|trykksetting)\b',
        re.I,
    )
    out: List[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        chunks: List[str] = []
        start = 0
        for m in re_lead.finditer(p):
            if m.start() > start:
                chunks.append(p[start:m.start()].strip())
            start = m.start()
        chunks.append(p[start:].strip())
        for c in chunks:
            if len(c) < 12:
                continue
            cl = c.lower()
            if any(v in cl for v in GLOBAL_OBLIGATION_VERBS) or UNITS_REGEX.search(cl) or re_lead.search(c):
                if not c.endswith(('.', ';')):
                    c = c + '.'
                out.append(c)
    # de-dupliser bevarende rekkefølge
    seen = set()
    uniq = []
    for s in out:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    return uniq


def _choose_domain_from_inputs(fokus_text: str = "", selected_groups: List[str] | None = None) -> str:
    ft = (fokus_text or "").lower()
    for key, prof in DOMAIN_PROFILES.items():
        if key == "generic":
            continue
        if any(a in ft for a in prof.get("aliases", [])):
            return key
    if selected_groups:
        s = " ".join([str(g).lower() for g in selected_groups])
        for key in DOMAIN_PROFILES.keys():
            if key != "generic" and key in s:
                return key
        if "rør" in s:
            return "rørlegger"
    return "generic"


# --- NS-indeksering/embedding (lettvekts-cache) ---
def _ns_load_or_build_index(tm, standards_cfg: dict):
    """Laster/lager en enkel NS-indeks med embeddings per side.
    Returnerer dict: {std: [{"side": int, "tekst": str, "emb": np.ndarray}, ...], ...}
    """
    from contextlib import suppress
    try:
        import joblib  # type: ignore
    except Exception:
        joblib = None  # kjører uten disk-cache hvis ikke tilgjengelig

    idx: Dict[str, List[Dict[str, Any]]] = {}
    cache_path = getattr(tm, "NS_CACHE_PATH", None)

    # Prøv å laste cache
    if joblib and cache_path and Path(cache_path).exists():
        with suppress(Exception):
            idx = joblib.load(cache_path)  # type: ignore

    # Finn hvilke standarder som mangler i index
    missing = []
    for std, meta in standards_cfg.items():
        if not meta.get("aktiv"):
            continue
        if std not in idx or not idx[std]:
            missing.append(std)

    if missing:
        try:
            import fitz  # PyMuPDF
        except Exception:
            return idx

        sem = getattr(tm, "semantic_model", None)

        for std in missing:
            pdf_info = standards_cfg[std]
            pdf_path = pdf_info.get("path")
            if not pdf_path or not Path(pdf_path).is_file():
                continue
            chunks: List[Dict[str, Any]] = []
            with fitz.open(pdf_path) as doc:
                for i, page in enumerate(doc, start=1):
                    txt = page.get_text("text") or ""
                    txt = " ".join(txt.split())
                    if not txt:
                        continue
                    chunks.append({"side": i, "tekst": txt})

            if sem and chunks:
                texts = [c["tekst"] for c in chunks]
                vecs = sem.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
                for c, v in zip(chunks, vecs):
                    c["emb"] = np.asarray(v).astype(float)
            idx[std] = chunks

        if joblib and cache_path:
            with suppress(Exception):
                Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
                joblib.dump(idx, cache_path)

    return idx


def _ns_semantic_hits(tm, ns_index: dict, req_text: str, max_hits_per_std: int = 2):
    """Finn beste NS-treff per standard for et krav. Returnerer liste med dicts:
       [{"standard": "NS8415", "side": 12, "tekst": "…", "score": 87.3}, ...]
    """
    out: List[Dict[str, Any]] = []
    sem = getattr(tm, "semantic_model", None)

    def _token_overlap(a: str, b: str) -> float:
        sa = set(re.findall(r"\w+", a.lower()))
        sb = set(re.findall(r"\w+", b.lower()))
        if not sa or not sb:
            return 0.0
        inter = len(sa & sb)
        denom = max(1, min(len(sa), len(sb)))
        return 100.0 * (inter / denom)

    if sem:
        q = sem.encode([req_text], convert_to_numpy=True, normalize_embeddings=True)
        q = np.asarray(q).reshape(-1)
        if q.size == 0:
            return []
        for std, chunks in ns_index.items():
            if not chunks:
                continue
            sims: List[Tuple[float, Dict[str, Any]]] = []
            for c in chunks:
                v = c.get("emb")
                if v is None:
                    v = sem.encode([c["tekst"]], convert_to_numpy=True, normalize_embeddings=True)
                v = np.asarray(v).reshape(-1)
                if v.size == 0:
                    continue
                sc = float(np.dot(q, v))
                sims.append((sc, c))
            sims.sort(key=lambda x: x[0], reverse=True)
            for score, c in sims[:max_hits_per_std]:
                out.append({
                    "standard": std,
                    "side": c["side"],
                    "tekst": c["tekst"][:500].strip(),
                    "score": round(float(score) * 100.0, 1),
                })
    else:
        for std, chunks in ns_index.items():
            if not chunks:
                continue
            pairs = [(_token_overlap(req_text, c["tekst"]), c) for c in chunks]
            pairs.sort(key=lambda x: x[0], reverse=True)
            for sc, c in pairs[:max_hits_per_std]:
                if sc <= 0:
                    continue
                out.append({
                    "standard": std,
                    "side": c["side"],
                    "tekst": c["tekst"][:500].strip(),
                    "score": round(float(sc), 1),
                })
    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:5]


# ===========================================================================
#  ERSTATT HELE DEN GAMLE extract_requirements-FUNKSJONEN MED DENNE
# ===========================================================================

def extract_requirements(
    text: str,
    selected_function_groups: List[str],
    file_name: str,
    min_score: float,
    file_type: str,
    ns_standard_selection: str = "Ingen",
    mode: str = "keywords_ai",
    fokus_text: str = "",
    use_fokus_prefilter: bool = True,
    fokus_threshold: float = 0.60,
    selected_groups: Optional[List[str]] = None,
    **kwargs,
) -> List[Dict[str, Any]]:

    # Reload fag-modell (best-effort, uten å feile analyse)
    _reload_fag_model()

    # Henter konfigurasjon
    _cfg = EXTRACT_CFG

    tm = _task_models()
    fokus_text = (fokus_text or "").strip()
    dom_key = _choose_domain_from_inputs(fokus_text, selected_groups or [])
    dom_profile = DOMAIN_PROFILES.get(dom_key, DOMAIN_PROFILES["generic"])

    # === NYTT: sentral AI-terskel (fall-back 0.60) ===
    ai_min_thr = float(os.getenv("FAG_PRED_THRESHOLD", "0.60"))

    # --- Bygg søkeliste fra nokkelord.json (inkl. synonymer) ---
    kw_all = []
    try:
        app_dir = Path(__file__).resolve().parent.parent  # .../app
        nokkelord_path = app_dir / "data" / "nokkelord.json"
        if nokkelord_path.exists():
            nokkelord_data = json.loads(nokkelord_path.read_text(encoding="utf-8"))

            search_terms = set()
            for fag, funksjonssamlinger in nokkelord_data.items():
                for fs_navn, nokkelord in funksjonssamlinger.items():
                    if fs_navn in selected_function_groups:
                        for nokkelord_navn, synonymer in nokkelord.items():
                            search_terms.add(nokkelord_navn.lower())
                            for synonym in synonymer:
                                search_terms.add(synonym.lower())

            kw_all = sorted(list(search_terms))
            _log.info("Bygget søkeliste med %d termer fra %d valgte grupper.", len(kw_all), len(selected_function_groups))
    except Exception as e:
        _log.error("Kunne ikke bygge nøkkelordliste fra nokkelord.json: %s", e)
        # Fortsetter med tom liste hvis det feiler

    # --- Del opp i setninger (m/ sideinfo hvis tilgjengelig) ---
    sentences: List[str] = []
    page_for_sent: List[str] = []
    parts = re.split(r'\[\[SIDE\s+(\d+)\]\]', text or "")
    tm_nlp = getattr(tm, "nlp", None)

    if len(parts) >= 3:
        it = iter(parts[1:])
        for page_no, page_text in zip(it, it):
            page_no = str(page_no).strip()
            if tm_nlp:
                try:
                    doc = tm_nlp(page_text)
                    for s in doc.sents:
                        st = (s.text or "").strip()
                        if st:
                            sentences.append(st)
                            page_for_sent.append(page_no)
                except Exception:
                    for st in re.split(r'(?<=[.!?])\s+', page_text):
                        st = st.strip()
                        if st:
                            sentences.append(st)
                            page_for_sent.append(page_no)
            else:
                for st in re.split(r'(?<=[.!?])\s+', page_text):
                    st = st.strip()
                    if st:
                        sentences.append(st)
                        page_for_sent.append(page_no)
    else:
        page_no = "Ukjent"
        if tm_nlp:
            try:
                for s in tm_nlp(text or "").sents:
                    st = (s.text or "").strip()
                    if st:
                        sentences.append(st)
                        page_for_sent.append(page_no)
            except Exception:
                for st in re.split(r'(?<=[.!?])\s+', text or ""):
                    st = st.strip()
                    if st:
                        sentences.append(st)
                        page_for_sent.append(page_no)
        else:
            for st in re.split(r'(?<=[.!?])\s+', text or ""):
                st = st.strip()
                if st:
                    sentences.append(st)
                    page_for_sent.append(page_no)

    if not sentences:
        return []

    # --- Bygg “atomiske” kravkandidater ---
    raw_atoms: List[str] = []
    raw_pages: List[str] = []
    for sent, pg in zip(sentences, page_for_sent):
        for c in _split_atomic_requirements(sent):
            raw_atoms.append(c)
            raw_pages.append(pg)

    if not raw_atoms:
        return []

    # --- Scoring-hjelpere ---
    def kw_score(s: str) -> Tuple[float, str]:
        if not kw_all:
            return 0.0, ""
        s_norm = s.lower()
        best, best_kw = 0.0, ""
        for kw in kw_all:
            sc = float(token_set_ratio(s_norm, kw))
            if sc > best:
                best, best_kw = sc, kw
        return best, best_kw

    def rule_ai_score(s: str) -> float:
        sl = s.lower()
        pts = 0.0
        if any(v in sl for v in GLOBAL_OBLIGATION_VERBS):
            pts += 35.0
        if UNITS_REGEX.search(sl) or dom_profile["units_re"].search(sl):
            pts += 35.0
        if any(t in sl for t in dom_profile.get("terms", [])):
            pts += 20.0
        if len(s) > 90:
            pts += 5.0
        return min(100.0, pts)

    def fokus_boost(s: str) -> float:
        if not use_fokus_prefilter or not fokus_text:
            return 0.0
        sl = s.lower()
        pts = 0.0
        if any(tok for tok in re.split(r"[ ,;/]", fokus_text.lower()) if tok and tok in sl):
            pts += _cfg["focus_boost_hit"]
        for a in dom_profile.get("aliases", []):
            if a in sl:
                pts += _cfg["focus_boost_alias"]
                break
        return pts

    sem = getattr(tm, "semantic_model", None)
    sem_kw_vecs = None
    if sem and kw_all:
        try:
            sem_kw_vecs = sem.encode(list(kw_all), convert_to_numpy=True, normalize_embeddings=True)
            sem_kw_vecs = np.asarray(sem_kw_vecs)
            if sem_kw_vecs.ndim == 1:
                sem_kw_vecs = sem_kw_vecs.reshape(1, -1)
        except Exception:
            sem_kw_vecs = None

    def semantic_kw_score(s: str) -> float:
        if not (sem and sem_kw_vecs is not None and len(kw_all) > 0):
            return 0.0
        q = sem.encode([s], convert_to_numpy=True, normalize_embeddings=True)
        q = np.asarray(q).reshape(-1)
        if q.size == 0:
            return 0.0
        sims = np.dot(sem_kw_vecs, q)
        try:
            mx = float(np.max(sims))
        except Exception:
            mx = 0.0
        return float(mx * 100.0)

    use_kw = mode in ("keywords", "keywords_ai")
    use_rules = mode in ("ai", "keywords_ai")

    # --- Kontekstuell sammenslåing ---
    atoms: List[str] = []
    pages: List[str] = []
    i = 0
    while i < len(raw_atoms):
        c = raw_atoms[i]
        pg = raw_pages[i]
        kw_sc, _mkw = (kw_score(c) if use_kw else (0.0, ""))
        sem_sc = semantic_kw_score(c) if use_kw else 0.0
        strong = (kw_sc >= _cfg["kw_strong"]) or (sem_sc >= _cfg["sem_strong"])
        if strong:
            merged, used = _enrich_clause(raw_atoms, i, dom_profile)
            atoms.append(merged)
            pages.append(pg)
            i += int(used)
        else:
            atoms.append(c)
            pages.append(pg)
            i += 1

    # --- NS-standard mapping ---
    active_stds = {k: v for k, v in PDF_STANDARDER.items() if v.get("aktiv")}
    if ns_standard_selection and ns_standard_selection != "Ingen":
        active_stds = {k: v for k, v in active_stds.items() if k == ns_standard_selection}
    ns_index = _ns_load_or_build_index(tm, active_stds) if active_stds else {}

    if not _get_fag_model():
        _log.warning("Fag-modell ikke lastet – gruppe bestemmes via regex hvis AI ikke gir treff.")

    eff_min_score = float(min_score) if min_score is not None else float(_cfg["min_score_default"])

    results: List[Dict[str, Any]] = []

    for s, pg in zip(atoms, pages):
        if not is_valid_requirement(s):
            continue

        kw_sc, match_kw = (kw_score(s) if use_kw else (0.0, ""))
        ai_sc = rule_ai_score(s) if use_rules else 0.0
        sem_sc = semantic_kw_score(s) if use_kw else 0.0

        w_kw, w_sem, w_ai = _cfg["w_kw"], _cfg["w_sem"], _cfg["w_ai"]
        if use_kw and (kw_sc >= _cfg["kw_strong"] and sem_sc >= _cfg["sem_strong"]):
            wk, ws = _cfg["w_kw_sem_combo"]
            combined = min(100.0, wk * kw_sc + ws * sem_sc)
        else:
            combined = max(w_kw * kw_sc, w_sem * sem_sc, w_ai * ai_sc)

        score = max(0.0, min(100.0, combined + fokus_boost(s)))
        uncertain = score < eff_min_score
        if uncertain and score < GUARDED_PREVIEW_LOW_THR:
            continue

        if use_fokus_prefilter and use_rules and fokus_text:
            fokus_tokens = [t for t in re.split(r"[ ,;/]", fokus_text.lower()) if t]
            if fokus_tokens:
                hits = sum(1 for t in fokus_tokens if t in s.lower())
                sim = hits / max(1, len(fokus_tokens))
                thr = float(fokus_threshold if fokus_threshold is not None else _cfg["focus_threshold"])
                if sim < thr:
                    if not (use_kw and (kw_sc >= _cfg["kw_strong"] or sem_sc >= _cfg["sem_strong"])):
                        continue

        ns_treff: List[Dict[str, Any]] = []
        if ns_index:
            ns_hits = _ns_semantic_hits(tm, ns_index, s, max_hits_per_std=_cfg["ns_hits_per_std"])
            ns_treff = [h for h in ns_hits if h["score"] >= _cfg["ns_hit_min"]]

        # --- TYPE + FAG (AI først; fallback regex) ---
        kravtype = classify_type(s)

        # >>> NYTT: bruk sentral AI-terskel (ai_min_thr) <<<
        best_fag, _rank = classify_group_ai(s, min_score=ai_min_thr)

        top_sc = float(_rank[0][1]) if _rank else 0.0
        if best_fag:
            gruppe = best_fag
            gruppe_kilde = "ai"
        else:
            gruppe = classify_group(s)
            gruppe_kilde = "regex"
            _log.debug("Fallback til regex for kravtekst: %s", (s[:120] + "…") if len(s) > 120 else s)

        short_text = _generate_short_text(s)
        nlp_v = {
            "len": len(s),
            "has_verb": bool(re.search(r"\b(skal|må|kreves|skal\s+være|må\s+være)\b", s.lower())),
        }

        used_kw = match_kw if match_kw else ("(AI)" if (not use_kw or (use_rules and ai_sc >= max(kw_sc, sem_sc))) else "")
        ref = f"{file_name} / Side {pg}" if pg else file_name

        # Forklarbarhet og topp-k fag
        topk = [{"label": lbl, "score": float(sc)} for lbl, sc in (_rank[:EXPLAIN_TOPK] if _rank else [])]
        explain = {
            "kw_sc": float(kw_sc),
            "sem_sc": float(sem_sc),
            "ai_sc": float(ai_sc),
            "fokus_boost": float(fokus_boost(s)),
            "combined": float(score),
            "matched_keyword": used_kw or "",
        }

        # >>> VIKTIG: eksporter både 'gruppe' OG 'fag' til UI/revisjon <<<
        results.append({
            "keyword": used_kw or ("(AI)"),
            "text": s,
            "score": round(float(score), 1),
            "ref": ref,
            "kravtype": kravtype,

            # Fag / gruppe til revisjons-UI:
            "gruppe": gruppe,
            "fag": gruppe,                       # <— NYTT
            "gruppe_score": round(float(top_sc), 3),
            "fag_score": round(float(top_sc), 3), # <— NYTT (alias)
            "gruppe_rank": _rank[:5] if _rank else [],
            "fag_rank": _rank[:5] if _rank else [],  # <— NYTT (alias)
            "gruppe_kilde": gruppe_kilde,

            "ai_threshold": ai_min_thr,
            "ai_loaded": bool(_get_fag_model()),

            "short_text": short_text,
            "korttekst": short_text,
            "status": "Aktiv",
            "nlp_vurdering": nlp_v,
            "ns_treff": ns_treff,
            "uncertain": bool(score < eff_min_score),
            "top_fag": topk,
            "explain": explain,
            "ns_pin": None,
            "ns_quality": None,
        })

    results.sort(key=lambda x: (x.get("keyword", ""), -float(x.get("score", 0.0))))
    return results


# ---------------------------------------------------------------------------
# Deduplisering
# ---------------------------------------------------------------------------
def _normalize_for_fuzzy(s: str) -> str:
    s = (s or "").lower().replace("co₂", "co2").replace("°c", "c")
    s = s.replace(" m3 ", " m³ ").replace("m3/s", "m³/s").replace("m3/m2/t", "m³/m²/t")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\wæøå0-9/ ]", " ", s)
    s = re.sub(r"\bside\s*\d+\b", "", s, flags=re.I)
    return s.strip()


def _parse_ref(ref: str) -> Tuple[str, int | None]:
    m = re.match(r'^(.*?)\s*/\s*Side\s+(\d+)$', (ref or "").strip(), flags=re.I)
    if m:
        try:
            return m.group(1), int(m.group(2))
        except Exception:
            return m.group(1), None
    return ref, None


def _merge_refs(items: List[Dict[str, Any]]) -> str:
    by_file: Dict[str, set] = defaultdict(set)
    for it in items:
        fn, pg = _parse_ref(it.get("ref", ""))
        if fn:
            by_file[fn].add(pg if pg is not None else "")
    parts: List[str] = []
    for fn in sorted(by_file.keys()):
        pages = sorted([p for p in by_file[fn] if isinstance(p, int)])
        others = [p for p in by_file[fn] if not isinstance(p, int) and p]
        if pages:
            parts.append(f"{fn} / Side {', '.join(str(p) for p in pages)}")
        elif others:
            parts.append(f"{fn} / {', '.join(map(str, others))}")
        else:
            parts.append(fn)
    return "; ".join(parts)


def _norm_source(req: Dict[str, Any]) -> str:
    base = req.get("anchor") or req.get("text", "")
    return _normalize_for_fuzzy(base)


def deduplicate_requirements(requirements: List[Dict[str, Any]], threshold: int = 95, scope: str = "per_file") -> List[Dict[str, Any]]:
    if not requirements:
        return []

    def key(req: Dict[str, Any]):
        return req['ref'].split(' / ')[0] if scope == "per_file" else "__GLOBAL__"

    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    out: List[Dict[str, Any]] = []

    for r in requirements:
        groups[key(r)].append(r)

    for _, reqs in groups.items():
        reqs_sorted = sorted(reqs, key=lambda x: (x.get('score', 0.0), len(x.get('text', ''))), reverse=True)
        clusters: List[Tuple[Dict[str, Any], List[Dict[str, Any]]]] = []
        reps_norm: List[str] = []

        for r in reqs_sorted:
            tr = _norm_source(r)
            placed = False
            for ci, (_rep, items) in enumerate(clusters):
                sim = max(
                    token_set_ratio(tr, reps_norm[ci]),
                    fuzz_ratio(tr, reps_norm[ci]),
                    partial_ratio(tr, reps_norm[ci]),
                )
                if sim >= threshold:
                    items.append(r)
                    placed = True
                    break
            if not placed:
                clusters.append([r, [r]])
                reps_norm.append(_norm_source(r))

        for rep, items in clusters:
            merged = dict(rep)
            merged['dup_count'] = len(items) - 1
            merged['ref'] = _merge_refs(items)

            if any('ns_treff' in it for it in items):
                ns_all: List[Dict[str, Any]] = []
                seen = set()
                dedup_ns: List[Dict[str, Any]] = []
                for it in items:
                    ns_all.extend(it.get('ns_treff', []))
                for t in ns_all:
                    k = (t.get('standard'), t.get('side'), t.get('tekst'))
                    if k not in seen:
                        seen.add(k)
                        dedup_ns.append(t)
                merged['ns_treff'] = dedup_ns

            if merged['dup_count'] > 0:
                merged['short_text'] = (merged.get('short_text') or "") + f" (konsolidert x{merged['dup_count']+1})"

            out.append(merged)

    return out