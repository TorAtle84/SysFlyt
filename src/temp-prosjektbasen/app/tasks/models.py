# app/tasks/models.py
# -*- coding: utf-8 -*-
"""
Laster og holder AI/NLP-modeller for kravsporing:
- SpaCy (nb_core_news_lg/sm) [valgfri]
- Krav-validator (legacy) [valgfri]
- SentenceTransformer (semantikk) [valgfri]
- Fag-modell (kalibrert bundle: model+labels+thresholds) + hot-reload
- NB-BERT (embeddings) og NB-MNLI (entailment) [valgfrie]
- Hjelpefunksjoner (encode/predict/status)

Bakover-kompatibel med tidligere fag-artefakter (pipeline+labels).
"""
from __future__ import annotations

import os
import sys
import types
import logging
from pathlib import Path
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

# Joblib/pickle for modell-lagring
try:
    import joblib  # type: ignore
except Exception:  # pragma: no cover
    joblib = None  # type: ignore

try:
    import pickle  # type: ignore
except Exception:  # pragma: no cover
    pickle = None  # type: ignore

_log = logging.getLogger(__name__)
_log.info("Laster NLP/ML-moduler (app.tasks.models)…")

# ------------------------------------------------------------------------------
# Stier (robuste defaults med valgfri override fra training_logic)
# ------------------------------------------------------------------------------
APP_DIR = Path(__file__).resolve().parent.parent  # .../app
DATA_DIR_DEFAULT = APP_DIR / "data"

try:
    from app.training_logic import PKL_FAG_PROFILER as _TL_FAG  # type: ignore
    from app.training_logic import DATA_DIR as _TL_DATA         # type: ignore
except Exception:
    _TL_FAG = None
    _TL_DATA = None

DATA_DIR = Path(_TL_DATA) if _TL_DATA else DATA_DIR_DEFAULT
PKL_FAG_PROFILER = Path(_TL_FAG) if _TL_FAG else (DATA_DIR / "fag_profiler.pkl")

# Legacy/andre ressurser (valgfritt)
MODEL_PATH    = DATA_DIR / "fag_profiler.pkl"      # legacy validator
NS_CACHE_PATH = DATA_DIR / "ns_embeddings_cache.pkl"
SYNONYM_PATH  = DATA_DIR / "synonyms.json"

def _describe_file(p: Path) -> str:
    try:
        st = p.stat()
        return f"{p.resolve()} (size={st.st_size} bytes, mtime={st.st_mtime:.0f})"
    except Exception:
        return f"{p.resolve()} (ikke tilgjengelig)"

# ------------------------------------------------------------------------------
# Sikre pickle-avhengigheter (legacy) – injiser symboler i __main__ om nødvendig
# ------------------------------------------------------------------------------
def _ensure_pickle_dependencies():
    try:
        main_mod = sys.modules.get("__main__")
        if main_mod is None:
            main_mod = types.ModuleType("__main__")
            sys.modules["__main__"] = main_mod

        # RegexCounts (legacy)
        try:
            from app.ml.regex_features import RegexCounts as _RC  # type: ignore
            if getattr(main_mod, "RegexCounts", None) is None:
                setattr(main_mod, "RegexCounts", _RC)
                _log.debug("Injecterte RegexCounts i __main__ for pickle-kompatibilitet.")
        except Exception:
            pass

        # normalize_text (legacy)
        try:
            from app.ml.text_utils import normalize_text as _NT  # type: ignore
            if getattr(main_mod, "normalize_text", None) is None:
                setattr(main_mod, "normalize_text", _NT)
                _log.debug("Injecterte normalize_text i __main__ for pickle-kompatibilitet.")
        except Exception:
            pass
    except Exception:
        pass

_ensure_pickle_dependencies()

# ------------------------------------------------------------------------------
# Valgfrie tredjeparts-biblioteker
# ------------------------------------------------------------------------------
try:
    import spacy  # type: ignore
except Exception:
    spacy = None  # type: ignore

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:
    SentenceTransformer = None  # type: ignore

try:
    import torch  # type: ignore
    import torch.nn.functional as F  # type: ignore
    TORCH_AVAILABLE = True
except Exception:
    torch = None  # type: ignore
    F = None      # type: ignore
    TORCH_AVAILABLE = False

try:
    from transformers import (  # type: ignore
        AutoTokenizer, AutoModel, AutoModelForSequenceClassification
    )
except Exception:
    AutoTokenizer = AutoModel = AutoModelForSequenceClassification = None  # type: ignore

# Konfig
NB_BERT_NAME        = os.environ.get("NB_BERT_NAME", "NbAiLab/nb-bert-base")
MNLI_NAME           = os.environ.get("MNLI_NAME", "NbAiLab/nb-bert-base-mnli")
SENTENCE_MODEL_NAME = os.environ.get("SENTENCE_MODEL_NAME", "paraphrase-multilingual-MiniLM-L12-v2")
GLOBAL_FAG_THRESHOLD = float(os.environ.get("FAG_PRED_THRESHOLD", "0.40"))  # fallback-terskel

# Delte objekter
nlp = None
fag_profiler_model_legacy = None  # legacy validator (hvis brukt annet sted)
semantic_model = None
nb_tokenizer = None
nb_model = None
NB_BERT_READY = False
mnli_tokenizer = None
mnli_model = None
MNLI_READY = False
global_ns_data = defaultdict(list)

# ------------------------------------------------------------------------------
# SpaCy (med fallback)
# ------------------------------------------------------------------------------
if spacy is not None:
    try:
        nlp = spacy.load("nb_core_news_lg")
        _log.info("SpaCy 'nb_core_news_lg' lastet.")
    except Exception as e_lg:
        _log.warning("SpaCy 'lg' feilet (%s). Forsøker 'nb_core_news_sm'…", e_lg)
        try:
            nlp = spacy.load("nb_core_news_sm")
            _log.info("SpaCy 'nb_core_news_sm' lastet.")
        except Exception as e_sm:
            nlp = None
            _log.error("SpaCy feilet også med 'sm': %s. Fortsetter uten SpaCy.", e_sm)
else:
    _log.info("SpaCy ikke tilgjengelig. Fortsetter uten SpaCy.")

# ------------------------------------------------------------------------------
# Krav-validator (legacy) – valgfri
# ------------------------------------------------------------------------------
if MODEL_PATH.exists() and joblib is not None:
    try:
        fag_profiler_model_legacy = joblib.load(MODEL_PATH)  # type: ignore
        _log.info("Krav-validator (legacy) lastet: %s", MODEL_PATH)
    except Exception as e:
        fag_profiler_model_legacy = None
        _log.warning("Krav-validator (legacy) feilet: %s", e)
else:
    _log.debug("Krav-validator (legacy) ikke funnet eller joblib utilgjengelig: %s", MODEL_PATH)

# ------------------------------------------------------------------------------
# SentenceTransformer (semantikk) – valgfri
# ------------------------------------------------------------------------------
if SentenceTransformer is not None:
    try:
        semantic_model = SentenceTransformer(SENTENCE_MODEL_NAME)
        _log.info("SentenceTransformer lastet: %s", SENTENCE_MODEL_NAME)
    except Exception as e:
        semantic_model = None
        _log.warning("SentenceTransformer feilet: %s", e)
else:
    _log.info("sentence_transformers ikke tilgjengelig – semantikk deaktivert.")

# ------------------------------------------------------------------------------
# Fag-modell (NY bundle) – last + hot-reload
# Bundle-format (nytt):
# {
#   "model": CalibratedClassifierCV(estimator=Pipeline(Tfidf->LogReg)),
#   "labels": ["byggautomasjon", "elektro", ...],
#   "thresholds": [t0, t1, ...]  # valgfritt
#   "meta": {...}
# }
# Legacy-format:
# {
#   "pipeline": Pipeline(Tfidf->LogReg),
#   "labels": [...],
#   "thresholds": [...],  # valgfritt
#   "meta": {...}
# }
# ------------------------------------------------------------------------------
_fag_bundle: Optional[dict] = None
_fag_mtime: Optional[float] = None

def _try_load_pickle(p: Path):
    """Prøv joblib først, deretter ren pickle. Returner objekt eller None."""
    _ensure_pickle_dependencies()
    if joblib is not None:
        try:
            return joblib.load(p)  # type: ignore
        except Exception as e_joblib:
            _log.debug("joblib.load feilet for %s: %s", p, e_joblib)
    if pickle is not None:
        try:
            with open(p, "rb") as f:
                return pickle.load(f)  # type: ignore
        except Exception as e_pickle:
            _log.debug("pickle.load feilet for %s: %s", p, e_pickle)
    return None

def _extract_model_labels_thresholds(bundle: dict) -> Tuple[Any, List[str], Optional[List[float]]]:
    """
    Henter ut (model, labels, thresholds) fra både nytt og legacy bundle.
    - model: CalibratedClassifierCV eller Pipeline med predict_proba
    - labels: liste[str]
    - thresholds: liste[float] eller None
    """
    model = bundle.get("model") or bundle.get("pipeline")
    labels = bundle.get("labels") or []
    thresholds = bundle.get("thresholds")  # kan være None
    if not isinstance(labels, list) or not labels:
        raise ValueError("Fag-bundle mangler eller har tom 'labels'.")
    if model is None:
        raise ValueError("Fag-bundle mangler 'model'/'pipeline'.")
    return model, labels, thresholds

def reload_fag_model() -> Optional[dict]:
    """Laster fag-bundle fra PKL_FAG_PROFILER. Hot-reloader ved mtime-endring."""
    global _fag_bundle, _fag_mtime
    p = Path(PKL_FAG_PROFILER)
    _log.info("Forsøker å laste fag-bundle fra: %s", _describe_file(p))
    if not p.is_file():
        _log.warning("Fag-bundle mangler: %s", p.resolve())
        _fag_bundle, _fag_mtime = None, None
        return None

    try:
        mtime = p.stat().st_mtime
    except Exception:
        mtime = None

    if _fag_bundle is not None and _fag_mtime is not None and mtime == _fag_mtime:
        _log.info("Fag-bundle uendret (mtime=%s). Beholder cached.", _fag_mtime)
        return _fag_bundle

    bundle = _try_load_pickle(p)
    if not isinstance(bundle, dict):
        _log.error("Fag-bundle er ikke dict/kunne ikke lastes.")
        _fag_bundle, _fag_mtime = None, None
        return None

    try:
        model, labels, thresholds = _extract_model_labels_thresholds(bundle)
    except Exception as e:
        _log.error("Fag-bundle mangler nødvendige felt: %s", e)
        _fag_bundle, _fag_mtime = None, None
        return None

    # Logg litt nyttig status
    try:
        _log.info("Fag-bundle lastet OK: %s", _describe_file(p))
        _log.info("Labels (%d): %s", len(labels), labels)
        if thresholds is not None:
            _log.info("Per-klasse terskler finnes (%d).", len(thresholds))
        meta = bundle.get("meta", {})
        if meta:
            _log.info("Meta: saved_at=%s, n_samples=%s, f1_macro=%s, acc=%s",
                      meta.get("saved_at"), meta.get("n_samples"),
                      meta.get("f1_macro"), meta.get("accuracy"))
    except Exception:
        pass

    _fag_bundle, _fag_mtime = bundle, mtime
    return _fag_bundle

# Init ved import (best-effort)
try:
    reload_fag_model()
except Exception as e:
    _log.warning("reload_fag_model ved import feilet: %s", e)

def get_fag_model() -> Optional[dict]:
    """Returnerer gjeldende fag-bundle (dict) eller None."""
    return _fag_bundle

# ------------------------------------------------------------------------------
# Normalisering
# ------------------------------------------------------------------------------
def _normalize_text_local(s: str) -> str:
    s = (s or "").strip()
    s = " ".join(s.split())
    return s.lower()

def _normalize_text(s: str) -> str:
    try:
        from app.ml.text_utils import normalize_text as _ext_norm  # type: ignore
        return _ext_norm(s)
    except Exception:
        return _normalize_text_local(s)

# ------------------------------------------------------------------------------
# Fag-prediksjon (kalibrert) med terskler
# ------------------------------------------------------------------------------
def _get_bundle_components(bundle: dict) -> Tuple[Any, List[str], Optional[List[float]]]:
    """Trygt uttrekk av (model, labels, thresholds)."""
    model, labels, thresholds = _extract_model_labels_thresholds(bundle)
    return model, labels, thresholds

def _apply_threshold(idx: int, score: float, thresholds: Optional[List[float]]) -> bool:
    """Returnerer True hvis score >= terskel (per-klasse eller global)."""
    if thresholds and 0 <= idx < len(thresholds):
        return score >= float(thresholds[idx])
    return score >= GLOBAL_FAG_THRESHOLD

def fag_predict(text: str) -> dict:
    """
    Trygg fagprediksjon basert på lastet bundle.
    Returnerer:
      {"label": <str>, "score": <float 0-1>, "ok": <bool>, "reason": <str|None>}
    """
    bundle = get_fag_model()
    if not isinstance(bundle, dict):
        return {"label": "Uspesifisert", "score": 0.0, "ok": False, "reason": "model_not_loaded"}

    try:
        model, labels, thresholds = _get_bundle_components(bundle)

        x = _normalize_text(text or "")
        if not x:
            return {"label": "Uspesifisert", "score": 0.0, "ok": False, "reason": "empty_text"}

        # Forventet: CalibratedClassifierCV eller Pipeline med predict_proba
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba([x])[0]
            # robust 1D
            try:
                import numpy as _np
                proba = _np.asarray(proba, dtype=float).reshape(-1)
            except Exception:
                proba = [float(p) for p in proba]
            idx = int(max(range(len(proba)), key=lambda i: proba[i]))
            score = float(proba[idx])
            label = labels[idx] if 0 <= idx < len(labels) else str(idx)
        else:
            # Sjeldent tilfelle (legacy uten sannsynlighet)
            pred = model.predict([x])
            try:
                import numpy as _np
                idx = int(_np.asarray(pred).ravel()[0])
            except Exception:
                idx = int(pred[0]) if isinstance(pred, (list, tuple)) else 0
            label = labels[idx] if 0 <= idx < len(labels) else str(idx)
            score = 1.0

        # Terskel-sjekk
        if not _apply_threshold(idx, score, thresholds):
            return {"label": "Uspesifisert", "score": score, "ok": True, "reason": "below_threshold"}

        return {"label": str(label), "score": float(score), "ok": True, "reason": None}

    except Exception as e:
        _log.warning("fag_predict feilet: %s", e, exc_info=True)
        return {"label": "Uspesifisert", "score": 0.0, "ok": False, "reason": "exception"}

# ------------------------------------------------------------------------------
# NB-BERT (embeddings) – GPU→CPU fallback (valgfritt)
# ------------------------------------------------------------------------------
DEVICE = None
if TORCH_AVAILABLE and (AutoTokenizer is not None and AutoModel is not None):
    try:
        DEVICE = "cuda" if torch.cuda.is_available() else "cpu"  # type: ignore
        nb_tokenizer = AutoTokenizer.from_pretrained(NB_BERT_NAME)
        try:
            nb_model = AutoModel.from_pretrained(NB_BERT_NAME).to(DEVICE).eval()
            NB_BERT_READY = True
        except Exception as oom:
            _log.warning("NB-BERT på %s feilet (%s). Faller tilbake til CPU…", DEVICE, oom)
            nb_model = AutoModel.from_pretrained(NB_BERT_NAME).to("cpu").eval()
            NB_BERT_READY = True
        _log.info("NB-BERT lastet på %s.", next(nb_model.parameters()).device)  # type: ignore
    except Exception as e:
        nb_tokenizer, nb_model, NB_BERT_READY = None, None, False
        _log.warning("NB-BERT feilet: %s", e)
else:
    _log.info("transformers/torch ikke tilgjengelig – hopper over NB-BERT.")

# ------------------------------------------------------------------------------
# NB-MNLI (entailment) – GPU→CPU fallback (valgfritt)
# ------------------------------------------------------------------------------
if TORCH_AVAILABLE and (AutoTokenizer is not None and AutoModelForSequenceClassification is not None):
    try:
        mnli_tokenizer = AutoTokenizer.from_pretrained(MNLI_NAME)
        try:
            mnli_model = AutoModelForSequenceClassification.from_pretrained(MNLI_NAME).to(DEVICE or "cpu").eval()
            MNLI_READY = True
        except Exception as oom:
            _log.warning("NB-MNLI på %s feilet (%s). Faller tilbake til CPU…", DEVICE, oom)
            mnli_model = AutoModelForSequenceClassification.from_pretrained(MNLI_NAME).to("cpu").eval()
            MNLI_READY = True
        _log.info("NB-MNLI lastet på %s.", next(mnli_model.parameters()).device)  # type: ignore
    except Exception as e:
        mnli_tokenizer, mnli_model, MNLI_READY = None, None, False
        _log.warning("NB-MNLI feilet: %s", e)
else:
    _log.info("transformers/torch ikke tilgjengelig – hopper over NB-MNLI.")

# ------------------------------------------------------------------------------
# Semantiske hjelpere
# ------------------------------------------------------------------------------
def _mean_pooling(model_output, attention_mask):
    token_embeddings = model_output[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    denom = input_mask_expanded.sum(1).clamp(min=1e-9)
    return (token_embeddings * input_mask_expanded).sum(1) / denom

def _ensure_torch_ready():
    if not TORCH_AVAILABLE or nb_tokenizer is None or nb_model is None:
        raise RuntimeError("NB-BERT ikke initialisert.")

def _to_numpy(x):
    try:
        import numpy as _np
        if hasattr(x, "detach"):
            x = x.detach().cpu().numpy()
        return _np.asarray(x)
    except Exception:
        return x

def _l2_normalize(v):
    try:
        import numpy as _np
        v = _np.asarray(v, dtype=float)
        n = _np.linalg.norm(v, axis=-1, keepdims=True)
        n[n == 0] = 1.0
        return v / n
    except Exception:
        return v

if TORCH_AVAILABLE:
    import torch  # type: ignore
    import torch.nn.functional as F  # type: ignore

@torch.no_grad() if TORCH_AVAILABLE else (lambda fn: fn)
def nb_bert_encode(texts: List[str]):
    """Returnerer L2-normaliserte setnings-embeddings for en liste tekster (NumPy array)."""
    _ensure_torch_ready()
    tokens = nb_tokenizer(texts, padding=True, truncation=True, return_tensors="pt")  # type: ignore
    dev = next(nb_model.parameters()).device  # type: ignore
    tokens = {k: v.to(dev) for k, v in tokens.items()}
    outputs = nb_model(**tokens)  # type: ignore
    sent_emb = _mean_pooling(outputs, tokens["attention_mask"])
    emb = F.normalize(sent_emb, p=2, dim=1)  # type: ignore
    return _to_numpy(emb)

@torch.no_grad() if TORCH_AVAILABLE else (lambda fn: fn)
def nb_mnli_predict(premise: str, hypothesis: str) -> dict:
    """Kjører NB-MNLI på (premise, hypothesis) og returnerer sannsynligheter."""
    if not TORCH_AVAILABLE or mnli_tokenizer is None or mnli_model is None:
        raise RuntimeError("NB-MNLI ikke initialisert.")
    dev = next(mnli_model.parameters()).device  # type: ignore
    tokens = mnli_tokenizer(premise, hypothesis, return_tensors="pt", truncation=True, padding=True)  # type: ignore
    tokens = {k: v.to(dev) for k, v in tokens.items()}
    logits = mnli_model(**tokens).logits  # type: ignore
    if hasattr(torch, "softmax"):
        probs = torch.softmax(logits, dim=-1)[0].tolist()  # type: ignore
    else:
        probs = [0.0, 1.0, 0.0]
    return {"contradiction": probs[0], "neutral": probs[1], "entailment": probs[2]}

def semantic_encode(texts: List[str]) -> "np.ndarray | None":
    """Encoder tekster med SentenceTransformer (hvis tilgjengelig) og normaliserer til enhetsvektor."""
    if semantic_model is None:
        return None
    try:
        vecs = semantic_model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True
        )
        return vecs
    except Exception as e:
        _log.warning("semantic_encode feilet: %s", e)
        return None

# ------------------------------------------------------------------------------
# Status for UI/health
# ------------------------------------------------------------------------------
def get_ai_status() -> Dict[str, Any]:
    bundle = get_fag_model()
    labels = []
    thresholds = None
    saved_at = None
    acc = None
    f1m = None
    if isinstance(bundle, dict):
        try:
            model, labels, thresholds = _get_bundle_components(bundle)
        except Exception:
            pass
        meta = bundle.get("meta", {})
        saved_at = meta.get("saved_at")
        acc = meta.get("accuracy")
        f1m = meta.get("f1_macro")

    return {
        "spacy": {"ready": bool(nlp is not None)},
        "validator_legacy": {"ready": bool(fag_profiler_model_legacy is not None), "path": str(MODEL_PATH)},
        "semantic": {"ready": bool(semantic_model is not None), "model": SENTENCE_MODEL_NAME},
        "nb_bert": {"ready": bool(NB_BERT_READY), "model": NB_BERT_NAME},
        "mnli": {"ready": bool(MNLI_READY), "model": MNLI_NAME},
        "fagmodell": {
            "ready": bool(isinstance(bundle, dict)),
            "path": str(PKL_FAG_PROFILER),
            "labels": labels,
            "thresholds": thresholds,
            "global_threshold": GLOBAL_FAG_THRESHOLD,
            "saved_at": saved_at,
            "accuracy": acc,
            "f1_macro": f1m,
        },
    }

# ------------------------------------------------------------------------------
# Eksporterte navn
# ------------------------------------------------------------------------------
__all__ = [
    "nlp",
    "fag_profiler_model_legacy",
    "semantic_model",
    "get_fag_model",
    "reload_fag_model",
    "fag_predict",
    "nb_tokenizer",
    "nb_model",
    "NB_BERT_READY",
    "mnli_tokenizer",
    "mnli_model",
    "MNLI_READY",
    "global_ns_data",
    "MODEL_PATH",
    "NS_CACHE_PATH",
    "PKL_FAG_PROFILER",
    "SYNONYM_PATH",
    "nb_bert_encode",
    "nb_mnli_predict",
    "semantic_encode",
    "get_ai_status",
]
