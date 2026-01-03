# app/api/kravsporing_ui.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pathlib import Path
from datetime import datetime
import json
import uuid
import shutil

# Vi proxier videre til dine eksisterende FastAPI-endepunkt for run/start/status
# via httpx (synkron klient for enkelhets skyld)
import httpx
import joblib

router = APIRouter(prefix="/kravsporing", tags=["kravsporing-ui"])

# Basisstier
BASE_TEMP = Path("app/temp")
JOBS_INDEX = BASE_TEMP / "_job_index.json"   # holder oversikt: job_id -> run_id

def _load_job_index() -> Dict[str, str]:
    if JOBS_INDEX.exists():
        try:
            return json.loads(JOBS_INDEX.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def _save_job_index(idx: Dict[str, str]) -> None:
    JOBS_INDEX.parent.mkdir(parents=True, exist_ok=True)
    JOBS_INDEX.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")

def _new_run_id() -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    rnd = uuid.uuid4().hex[:4]
    return f"run_{ts}_{rnd}"

def _run_dir(run_id: str) -> Path:
    return BASE_TEMP / run_id

def _latest_run_id() -> Optional[str]:
    """Finn siste run ved å se på mtime for results.json."""
    if not BASE_TEMP.exists():
        return None
    candidates = []
    for d in BASE_TEMP.iterdir():
        if not d.is_dir():
            continue
        r = d / "results.json"
        if r.exists():
            candidates.append((d.name, r.stat().st_mtime))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0][0]

# ------------------------------
# 1) AI-status (brukbar for UI)
# ------------------------------
@router.get("/ai-status")
def ai_status() -> Dict[str, Any]:
    """
    Returnerer statusflagg for modeller. Vi prøver å hente fra tasks,
    men er robuste dersom det ikke finnes.
    """
    nb_bert_ready = False
    mnli_ready = False
    try:
        # Hvis du eksponerer slike flagg i app.tasks under verify_and_load_models()
        from app import tasks  # type: ignore
        nb_bert_ready = bool(getattr(tasks, "NB_BERT_READY", False))
        mnli_ready    = bool(getattr(tasks, "MNLI_READY", False))
    except Exception:
        pass

    return {
        "nb_bert": {"ready": nb_bert_ready},
        "mnli": {"ready": mnli_ready},
    }

# --------------------------------------
# 2) Fagprofiler -> JSON for nøkkelord-UI
# --------------------------------------
@router.get("/fagprofiler")
def serve_fagprofiler() -> Dict[str, Any]:
    """
    Forsøker å hente fag-profiler fra:
      - app/data/fag_profiler.pkl (joblib dict)
      - evt. app/data/fagprofiler.json
    Struktur som returneres:
      { "profiles": { "<Navn>": { "core_terms": [...], "components": [...] }, ... } }
    """
    data_dir = Path("app/data")
    pkl = data_dir / "fag_profiler.pkl"
    js  = data_dir / "fagprofiler.json"

    profiles: Dict[str, Any] = {}

    if pkl.exists():
        try:
            obj = joblib.load(pkl)
            # forventer obj = { "profiles": { group: {"core_terms":[...], "components":[...]}, ... } } ELLER flatt dict
            if "profiles" in obj:
                profiles = obj["profiles"]
            else:
                profiles = obj  # fallback
        except Exception:
            pass

    if not profiles and js.exists():
        try:
            obj = json.loads(js.read_text(encoding="utf-8"))
            profiles = obj.get("profiles", obj)
        except Exception:
            pass

    return { "profiles": profiles }

# ------------------------------------------------------------
# 3) Start skann: tar imot skjema + filer, lagrer dem til run, 
#    og kaller /api/runs/start med temp_dir_path = den mappen.
# ------------------------------------------------------------
@router.post("/scan")
def scan(
    files: List[UploadFile] = File(default=[]),
    keywords: str = Form(""),
    min_score: int = Form(85),
    ns_standard_selection: str = Form("Ingen"),
    mode: str = Form("keywords_ai"),
    selected_groups: str = Form("[]"),
    fokusomraade: str = Form(""),
    use_nb_bert: str = Form("1"),
    use_mnli: str = Form("1"),
    top_k: str = Form("10"),
    mnli_entailment_min: str = Form("0.55"),
    mnli_contradiction_max: str = Form("0.40"),
    mnli_neutral_max: str = Form("0.70"),
):
    """
    1) Opretter nytt run-id og mappe
    2) Lagrer opplastede filer i run/input/
    3) POST'er til eksisterende backend: /api/runs/start
    4) Lagrer job_id -> run_id i indeks
    """
    run_id = _new_run_id()
    run_dir = _run_dir(run_id)
    in_dir = run_dir / "input"
    in_dir.mkdir(parents=True, exist_ok=True)

    # lagre filer
    for uf in files or []:
        if not uf.filename:
            continue
        outp = in_dir / uf.filename
        with outp.open("wb") as f:
            shutil.copyfileobj(uf.file, f)

    # Bygg JSON payload til /api/runs/start
    try:
        groups = json.loads(selected_groups) if selected_groups else []
    except Exception:
        groups = []

    payload = {
        "temp_dir_path": str(run_dir).replace("\\", "/"),
        "keywords": [s.strip() for s in keywords.split(",") if s.strip()],
        "min_score": int(min_score),
        "ns_standard_selection": ns_standard_selection,
        "mode": mode,
        "selected_groups": groups,
        "fokusomraade": fokusomraade,
        "ai_opts": {
            "use_nb_bert": use_nb_bert in ("1","true","True"),
            "use_mnli": use_mnli in ("1","true","True"),
            "top_k": int(top_k or 10),
            "mnli_entailment_min": float(mnli_entailment_min or 0.55),
            "mnli_contradiction_max": float(mnli_contradiction_max or 0.40),
            "mnli_neutral_max": float(mnli_neutral_max or 0.70),
        },
    }

    # Kall videre til din eksisterende API
    # NB: Uvicorn kjører vanligvis på 127.0.0.1:8000 for samme prosess
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post("http://127.0.0.1:8000/api/runs/start", json=payload)
        if r.status_code != 200:
            try:
                err = r.json()
            except Exception:
                err = {"detail": r.text}
            raise HTTPException(status_code=500, detail=f"start-feil: {err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kunne ikke starte run: {e}")

    js = r.json()
    job_id = js.get("job_id")
    if not job_id:
        raise HTTPException(status_code=500, detail="Fikk ikke job_id fra /api/runs/start")

    # indeksér
    idx = _load_job_index()
    idx[job_id] = run_id
    _save_job_index(idx)

    return {"ok": True, "job_id": job_id, "run_id": run_id}

# ----------------------------------------------------------
# 4) Status: proxier /api/runs/status/{job_id} og legger på
#    run_id + download_url (som backend allerede sender).
# ----------------------------------------------------------
@router.get("/status/{job_id}")
def status(job_id: str):
    try:
        with httpx.Client(timeout=60.0) as client:
            r = client.get(f"http://127.0.0.1:8000/api/runs/status/{job_id}")
        if r.status_code != 200:
            try:
                err = r.json()
            except Exception:
                err = {"detail": r.text}
            raise HTTPException(status_code=500, detail=f"status-feil: {err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kunne ikke hente status: {e}")

    js = r.json()
    # legg på run_id
    run_id = _load_job_index().get(job_id) or _latest_run_id()
    js["run_id"] = run_id
    return JSONResponse(js)

# -----------------------------------------------------
# 5) Review – hent siste items (for tabellen i UI)
#    (Bruker dine review-endepunkt)
# -----------------------------------------------------
@router.get("/review-last")
def review_last():
    # hent liste over runs fra /api/review/runs og velg siste
    try:
        with httpx.Client(timeout=30.0) as client:
            rr = client.get("http://127.0.0.1:8000/api/review/runs")
        if rr.status_code != 200:
            raise RuntimeError(rr.text)
        arr = rr.json()
        if not isinstance(arr, list) or not arr:
            return {"items": []}
        arr.sort(key=lambda x: x.get("modified", ""), reverse=True)
        run_id = arr[0].get("run_id")
        if not run_id:
            return {"items": []}
        ri = client.get(f"http://127.0.0.1:8000/api/review/{run_id}/items")
        if ri.status_code != 200:
            raise RuntimeError(ri.text)
        return {"run_id": run_id, "items": ri.json()}
    except Exception:
        # robust: returnér tomt
        return {"items": []}

# -----------------------------------------------------
# 6) Lagring av "Lær KI"-feedback fra KS-panelet
#    (lagres som filer – tasks.py kan senere konsumere)
# -----------------------------------------------------
@router.post("/feedback")
def save_feedback(payload: Dict[str, Any]):
    """
    Forventer: { items: [ {text, pred_fag, user_fag, action, comment, score}, ... ] }
    Lager to "bunker":
      - positive (keep/reassign)
      - negative (delete)
    Skriver én JSON pr. kall under app/temp/feedback/feedback_*.json
    """
    items = payload.get("items", [])
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="Tom feedback")

    pos, neg = [], []
    for it in items:
        action = (it.get("action") or "").lower().strip()
        if action in ("delete", "slett"):
            neg.append(it)
        else:
            # keep eller reassign regnes som positive eksempler
            pos.append(it)

    out_dir = BASE_TEMP / "feedback"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"feedback_{stamp}.json"
    out_js = {"positive": pos, "negative": neg}
    out_path.write_text(json.dumps(out_js, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"ok": True, "saved_pos": len(pos), "saved_neg": len(neg), "file": out_path.name}
