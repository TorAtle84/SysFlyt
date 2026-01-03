# app/routes/kravsporing.py
# -*- coding: utf-8 -*-
"""
Kravsporing – Flask Blueprint (konsolidert)
- Håndterer web-forespørsler for kravsporing.
- Starter Celery-tasks for tung prosessering
- Eksponerer API som matcher frontenden (analyse/ZIP + review/retrain).
"""
from __future__ import annotations

import os
import re
import json
import time
import shutil
import logging
import secrets
import tempfile
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any

from flask import (
    Blueprint, request, jsonify, send_file, render_template,
    url_for, abort, current_app
)
from flask_login import login_required, current_user
from celery.result import AsyncResult
from app.celery_instance import celery
from app.tasks.main import retrain_ai_task
from app.tasks.hardening import (validate_upload, validate_temp_id, secure_filename, json_error, attach_request_id)
from app.tasks.cleanup_lock import CleanupLock

try:
    from app.tasks.main import zip_from_review_task as _zip_task
except Exception:
    try:
        from app.tasks.main import generate_zip_from_review_task as _zip_task
    except Exception:
        _zip_task = None  # type: ignore
zip_from_review_task = _zip_task

try:
    from app.tasks.main import process_files_task  # riktig task for /scan
except Exception:
    process_files_task = None  # type: ignore
# ----------------------------------------------------------------------
# Blueprint
# ----------------------------------------------------------------------
bp = Blueprint("kravsporing", __name__, url_prefix="/kravsporing")
@bp.after_app_request
def _append_request_id(resp):
    # Why: enklere feilsøking på tvers av frontend/Flask/Celery
    return attach_request_id(resp)
log = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# Stier og konstanter
# ----------------------------------------------------------------------
APP_DIR: Path = Path(__file__).resolve().parent.parent
TEMP_ROOT: Path = APP_DIR / "temp"
DATA_DIR_STR = os.environ.get("KS_DATA_DIR", "app/data")
DATA_DIR = (APP_DIR.parent / DATA_DIR_STR).resolve() if not Path(DATA_DIR_STR).is_absolute() else Path(DATA_DIR_STR).resolve()
SYNONYM_PATH: Path = APP_DIR / "synonyms.json"
NOKKELORD_PATH = DATA_DIR / "nokkelord.json"                 # legacy-fil (for gammel UI)
DATASET_PATH = DATA_DIR / "nokkelord.dataset.json"           # ny chip-editor-fil

FAGPROFILER_CANDIDATES = [
    DATA_DIR / "fagprofiler.flat.json",
    DATA_DIR / "fagprofiler_flat.json",
]

ALLOWED_EXTS = {".pdf", ".docx", ".doc", ".txt", ".xlsx", ".msg"}
MAX_FILES = 50
MAX_TOTAL_SIZE_MB = 300

os.makedirs(TEMP_ROOT, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# --- Temp-cleanup (eldre enn X dager) ---
CLEANUP_AGE_DAYS = 2
CLEANUP_THROTTLE_SECONDS = 6 * 60 * 60  # kjør maks hver 6. time

def _is_older_than(path: Path, days: int) -> bool:
    try:
        age_sec = time.time() - path.stat().st_mtime
        return age_sec > days * 24 * 60 * 60
    except Exception:
        return False

def _maybe_cleanup_temp(now: Optional[float] = None) -> None:
    lock = CleanupLock(TEMP_ROOT / ".last_cleanup.lock", ttl_seconds=CLEANUP_THROTTLE_SECONDS)
    if not lock.acquire():
        return

    """
    Kjører opprydding i TEMP_ROOT, men maks én gang per CLEANUP_THROTTLE_SECONDS.
    Sletter filer/mapper eldre enn CLEANUP_AGE_DAYS.
    """
    now = now or time.time()
    stamp = TEMP_ROOT / ".last_cleanup"
    try:
        if stamp.exists():
            last = float(stamp.read_text(encoding="utf-8").strip() or "0")
            if (now - last) < CLEANUP_THROTTLE_SECONDS:
                return
    except Exception:
        pass

    deleted = 0
    try:
        for p in TEMP_ROOT.iterdir():
            if p.name.startswith("."):
                continue
            # Sjekk både mapper og enkeltfiler (zip, feillogger etc.)
            if _is_older_than(p, CLEANUP_AGE_DAYS):
                try:
                    if p.is_dir():
                        shutil.rmtree(p, ignore_errors=True)
                    else:
                        p.unlink(missing_ok=True)
                    deleted += 1
                except Exception:
                    log.warning("Kunne ikke slette %s", p, exc_info=True)
    finally:
        try:
            stamp.write_text(str(now), encoding="utf-8")
        except Exception:
            pass
        lock.release()
    if deleted:
        log.info("Temp-rydding: slettet %d eldre element(er) i %s", deleted, TEMP_ROOT)


# Laster synonymer ved oppstart (tåler korrupt fil)
try:
    synonyms: Dict[str, Any] = (
        json.loads(SYNONYM_PATH.read_text(encoding="utf-8"))
        if SYNONYM_PATH.exists() else {}
    )
except json.JSONDecodeError:
    log.error("Kunne ikke lese synonyms.json – starter tomt.")
    synonyms = {}

# ----------------------------------------------------------------------
# Feilhåndtering – alltid JSON fra dette blueprintet
# ----------------------------------------------------------------------
@bp.app_errorhandler(500)
def kravsporing_internal_error(e):
    current_app.logger.exception("Kravsporing 500-feil: %s", e)
    return jsonify({"ok": False, "error": "internal_server_error", "detail": str(e)}), 500

# ----------------------------------------------------------------------
# Hjelpefunksjoner (kun for web-laget)
# ----------------------------------------------------------------------
def _find_profiles_path() -> Optional[Path]:
    for p in FAGPROFILER_CANDIDATES:
        if p.exists():
            return p
    return None

def _normalize_profiles(raw: Any) -> dict:
    """Normaliserer fagprofiler til { 'profiles': { <fag>: { core_terms: [], components: [] } } }"""
    if isinstance(raw, dict) and "profiles" in raw:
        return raw
    if isinstance(raw, dict):
        prof = {}
        for grp, val in raw.items():
            if isinstance(val, list):
                terms = [str(x).strip() for x in val if str(x).strip()]
            else:
                terms = [t for t in re.split(r"[;,\s]+", str(val)) if t]
            prof[str(grp)] = {"core_terms": terms, "components": []}
        return {"profiles": prof}
    return {"profiles": {}}

def _load_fagprofiler_or_none() -> Optional[dict]:
    p = _find_profiles_path()
    if not p:
        return None
    try:
        raw = json.loads(p.read_text(encoding="utf-8-sig"))  # -sig for BOM
        return _normalize_profiles(raw)
    except Exception as e:
        log.warning(f"Kunne ikke lese/normalisere fagprofiler ({p}): {e}")
        return None

def _coerce_float(val: Any, default: float) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def _make_temp_dir(user_id: int) -> Path:
    rand = secrets.token_hex(4)
    folder = TEMP_ROOT / f"krav_{user_id}_{int(time.time())}_{rand}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder

def _validate_files(files) -> Tuple[bool, str]:
    ok, msg = validate_upload(
        files=files,
        max_files=MAX_FILES,
        total_limit_mb=MAX_TOTAL_SIZE_MB,
        allowed_exts=ALLOWED_EXTS,
    )
    return ok, msg

# ----------------------- Chip-editor format helpers -----------------------
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()

def _dedupe_ci(items: list[str]) -> list[str]:
    seen = {}
    for x in items:
        k = _norm(x)
        if k and k not in seen:
            seen[k] = x.strip()
    return list(seen.values())

def _slugify(s: str) -> str:
    s = re.sub(r"[\u0300-\u036f]", "", s, flags=re.UNICODE)
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or f"fag_{secrets.token_hex(2)}"

def _is_dataset_format(obj: Any) -> bool:
    if not isinstance(obj, dict) or not obj:
        return False
    for v in obj.values():
        if not (isinstance(v, dict) and isinstance(v.get("concepts"), list)):
            return False
    return True

def _is_legacy_format(obj: Any) -> bool:
    return isinstance(obj, dict) and isinstance(obj.get("fag"), dict)

def _legacy_to_dataset(legacy: dict) -> dict:
    """Migrer legacy {'fag':{<fag>:{'funksjoner':{...}}}} -> dataset-format for chip-editor."""
    out: dict[str, dict] = {}
    fag_map: dict[str, dict] = legacy.get("fag", {}) if isinstance(legacy, dict) else {}
    for fag_navn, fagnode in fag_map.items():
        concepts_by_key: dict[str, dict] = {}
        funksjoner = (fagnode or {}).get("funksjoner", {}) if isinstance(fagnode, dict) else {}
        for _, funknode in (funksjoner or {}).items():
            nokkelord = (funknode or {}).get("nokkelord", {}) if isinstance(funknode, dict) else {}
            for base, syns in nokkelord.items():
                base_s = str(base or "").strip()
                if not base_s:
                    continue
                key = _norm(base_s)
                entry = concepts_by_key.setdefault(key, {"canonical": base_s, "synonyms": []})
                if isinstance(syns, list):
                    entry["synonyms"].extend(str(s).strip() for s in syns if str(s).strip())

        # finalize
        concepts = []
        for c in concepts_by_key.values():
            syns = [s for s in _dedupe_ci(c["synonyms"]) if _norm(s) != _norm(c["canonical"])]
            concepts.append({
                "id": f"c_{secrets.token_hex(4)}",
                "canonical": c["canonical"],
                "synonyms": syns,
            })
        concepts.sort(key=lambda x: x["canonical"].lower())
        out[_slugify(fag_navn)] = {"name": fag_navn, "concepts": concepts}
    return out

def _dataset_to_legacy(dataset: dict) -> dict:
    """Konverter dataset->legacy. Info om 'funksjoner' finnes ikke; legges under 'Generelt'."""
    if not _is_dataset_format(dataset):
        return {"fag": {}}
    fag = {}
    for _, group in dataset.items():
        name = group.get("name") or "Uten navn"
        funknok = {}
        for c in group.get("concepts", []):
            base = str(c.get("canonical") or "").strip()
            if not base:
                continue
            syns = [str(s).strip() for s in c.get("synonyms", []) if str(s).strip()]
            funknok[base] = _dedupe_ci(syns)
        fag[name] = {"funksjoner": {"Generelt": {"nokkelord": funknok}}}
    return {"fag": fag}

def _atomic_write_json(path: Path, obj: Any) -> None:
    """Skriv JSON atomisk (tmp + os.replace)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, indent=2)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=str(path.parent), prefix=path.name + ".", suffix=".tmp", encoding="utf-8") as tf:
        tf.write(txt)
        tmp_name = tf.name
    os.replace(tmp_name, path)

# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------

@bp.route("/", endpoint="kravsporing")
@login_required
def kravsporing_view():
    """Hovedsiden for kravsporing."""
    _maybe_cleanup_temp()
    return render_template("kravsporing.html", fagprofiler=_load_fagprofiler_or_none())

@bp.route("/fagprofiler.json", methods=["GET"], endpoint="serve_fagprofiler_json")
@login_required
def serve_fagprofiler_json():
    p = _find_profiles_path()
    if not p:
        abort(404)
    try:
        raw = json.loads(p.read_text(encoding="utf-8-sig"))
        data = _normalize_profiles(raw)
        return jsonify(data)
    except Exception as e:
        log.error(f"Feil ved serving av fagprofiler ({p}): {e}", exc_info=True)
        return jsonify({"error": "kunne_ikke_laste_fagprofiler"}), 500

# ----------------------------- Scan / Analyze -----------------------------

@bp.route("/scan", methods=["POST"], endpoint="scan")
@login_required
def scan_files_start():
    """
    Mottar filer og starter bakgrunnsjobb for analyse.
    Svar: {"job_id": "<celery-id>"}
    """

    _maybe_cleanup_temp()

    ok, msg = validate_upload(
        files=request.files.getlist("files[]"),
        max_files=MAX_FILES,
        total_limit_mb=MAX_TOTAL_SIZE_MB,
        allowed_exts=ALLOWED_EXTS,
    )
    if not ok:
        return jsonify({"error": msg}), 400

    temp_dir = _make_temp_dir(current_user.id)
    try:
        for uploaded_file in request.files.getlist("files[]"):
            if uploaded_file and uploaded_file.filename:
                filename = secure_filename(uploaded_file.filename)
                dest = temp_dir / filename
                uploaded_file.save(dest)
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        log.error("Kunne ikke lagre opplastet fil: %s", e, exc_info=True)
        return jsonify({"error": "Kunne ikke lagre fil for prosessering."}), 500

    # --- Normaliser utvalg av funksjonsgrupper ---
    selected_groups: list[str] = []
    raw_selected_groups = request.form.get("selected_groups")  # JSON-list som streng
    if raw_selected_groups:
        try:
            sg = json.loads(raw_selected_groups)
            if isinstance(sg, list):
                selected_groups = [str(x).strip() for x in sg if str(x).strip()]
        except Exception:
            log.warning("selected_groups kunne ikke JSON-dekodes; faller tilbake.")

    if not selected_groups:
        sg_list = request.form.getlist("selected_function_groups[]") or request.form.getlist("selected_function_groups")
        if sg_list:
            seen = set()
            clean = []
            for x in sg_list:
                v = str(x).strip()
                if v and v not in seen:
                    seen.add(v)
                    clean.append(v)
            selected_groups = clean

    # Bygg task-argumenter i samsvar med app.tasks.main.process_files_task
    temp_id = temp_dir.name
    mode = request.form.get("mode", "keywords_ai")
    fokus = (request.form.get("fokusomraade") or "").strip()
    min_score = _coerce_float(request.form.get("min_score"), 85.0)
    ns_sel = request.form.get("ns_standard_selection", "Ingen")

    # Lagre parametre (nyttig for senere /review/zip)
    (temp_dir / "params.json").write_text(json.dumps({
        "mode": mode,
        "groups": selected_groups,
        "min_score": min_score,
        "ns_selection": ns_sel,
        "fokus": fokus
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # Sørg for at Celery-task er tilgjengelig
    if process_files_task is None:
        shutil.rmtree(temp_dir, ignore_errors=True)
        log.error("process_files_task er ikke lastet/tilgjengelig.")
        return jsonify({"error": "Bakgrunnsjobb ikke tilgjengelig (process_files_task)."}), 503
    try:
        # process_files_task leser selv filer fra temp_dir_path
        task = process_files_task.delay(
            temp_dir_path=str(temp_dir),
            keywords=[],                       # (valgfritt) – frontend kan evt. sende senere
            min_score=min_score,
            user_id=current_user.id,
            ns_standard_selection=ns_sel,
            mode=mode,
            selected_groups=selected_groups,
            fokusomraade=fokus,
            ai_settings={},                    # plassholder for fremtidige toggles
        )
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        log.error("Kunne ikke starte bakgrunnsjobb: %s", e, exc_info=True)
        return jsonify({"error": "Kunne ikke starte bakgrunnsjobb."}), 500

    return jsonify({"job_id": task.id}), 202

# ----------------------------- Status (ENESTE) -----------------------------

@bp.route("/status/<task_id>", methods=["GET"])
@login_required
def kravsporing_status(task_id: str):
    """
    Frontend-kontrakt:
      PROGRESS: {"state":"PROGRESS","meta":{"status":str,"current":int,"total":int}}
      SUCCESS (analyse): {"state":"SUCCESS","result":{"temp_folder_id":..,"preview":{"requirements":[...]}}}
      SUCCESS (zip): {"state":"SUCCESS","result":{"download_url": "..."}}
    """
    try:
        # Bruk eksisterende Celery-instans dersom tilgjengelig
        res = AsyncResult(task_id, app=celery) if celery else AsyncResult(task_id)
        state = res.state
        meta = res.info if isinstance(res.info, dict) else {}

        # Start med en flat payload som også frontend kan lese universelt
        payload = {
            "state": state,
            "meta": meta or {},
            "ok": state == "SUCCESS",
            "ready": state in ("SUCCESS", "FAILURE", "REVOKED"),
            "successful": state == "SUCCESS",
        }

        if state == "PROGRESS":
            m = meta or {}
            payload["meta"] = {
                "status": m.get("status", "Arbeider..."),
                "current": int(m.get("current", 0) or 0),
                "total": int(m.get("total", 100) or 100),
            }
            return jsonify(payload), 200

        if state == "SUCCESS":
            result = res.result if isinstance(res.result, dict) else {}
            payload["result"] = result

            # Sørg for download_url hvis vi kjenner temp-folder
            temp_id = (result.get("temp_folder_id") or meta.get("temp_folder_id"))
            if temp_id and not result.get("download_url"):
                try:
                    payload["result"]["download_url"] = url_for(
                        "kravsporing.download_results",
                        temp_folder_id=temp_id
                    )
                except Exception:
                    pass
            return jsonify(payload), 200

        if state in ("FAILURE", "REVOKED"):
            # Returner litt mer struktur for enklere feilhåndtering i frontend
            return jsonify({
                "state": state,
                "ok": False,
                "ready": True,
                "successful": False,
                "error": "task_failed",
                "detail": str(res.result),
                "meta": meta or {},
            }), 200

        # PENDING / STARTED (eller andre mellomtilstander)
        return jsonify(payload), 200

    except Exception as e:
        current_app.logger.exception("Feil i kravsporing_status for task %s: %s", task_id, e)
        return jsonify({
            "state": "FAILURE",
            "ok": False,
            "ready": True,
            "successful": False,
            "error": "exception",
            "detail": str(e),
        }), 200

# ----------------------------- Review-data -----------------------------

@bp.route('/review_data', methods=['POST'])
@login_required
def review_data():
    """
    Frontend forventer å POSTe { temp_folder_id } og få tilbake:
      { ok: True, temp_folder_id: str, requirements: [...] }

    Kildeprioritet:
      1) reviewed_requirements.json  (hvis bruker har lagret endringer)
      2) requirements.json           (normalisert liste fra analyse-task)
      3) results.json                (rå struktur; støtter preview.requirements)
    """
    data = request.get_json(silent=True) or {}
    temp_id = data.get('temp_folder_id')
    ok, err = validate_temp_id(current_user.id, TEMP_ROOT, temp_id or "")
    if not ok:
        return json_error(403 if "Uautorisert" in err else 404 if "ikke funnet" in err else 400, "invalid_temp_id", err)

    if not temp_id:
        return jsonify({"ok": False, "error": "temp_folder_id mangler"}), 400
    if not temp_id.startswith(f"krav_{current_user.id}_"):
        return jsonify({"ok": False, "error": "Uautorisert tilgang"}), 403

    temp_dir = TEMP_ROOT / temp_id
    if not temp_dir.is_dir():
        return jsonify({"ok": False, "error": "Midlertidig mappe ikke funnet"}), 404

    candidates = [
        temp_dir / "reviewed_requirements.json",  # etter bruker-review
        temp_dir / "requirements.json",           # normalisert liste
        temp_dir / "results.json",                # ev. rå resultatskjemastruktur
    ]

    requirements = []
    src_used = None

    for p in candidates:
        if not p.exists():
            continue
        try:
            payload = json.loads(p.read_text(encoding="utf-8"))
            # Struktur 1: Filen er direkte en liste med krav
            if isinstance(payload, list):
                requirements = payload
                src_used = p.name
                break

            # Struktur 2: Filen er et objekt
            if isinstance(payload, dict):
                # Foretrukkent: eksplisitt "requirements": [...]
                if isinstance(payload.get("requirements"), list):
                    requirements = payload["requirements"]
                    src_used = p.name
                    break
                # Alternativ i results.json: "preview": {"requirements":[...]}
                prev = payload.get("preview")
                if isinstance(prev, dict) and isinstance(prev.get("requirements"), list):
                    requirements = prev["requirements"]
                    src_used = p.name
                    break
        except Exception as e:
            log.warning("review_data: kunne ikke lese %s: %s", p, e, exc_info=True)

    # Defensive defaults
    if not isinstance(requirements, list):
        requirements = []

    # Lett normalisering per krav (ikke-destruktiv)
    def _norm_item(it: dict) -> dict:
        if not isinstance(it, dict):
            return {}
        out = dict(it)
        # Sørg for gruppe/fag-felt (bevar verdi dersom satt)
        grp = out.get("gruppe")
        fag = out.get("fag")
        if not grp and isinstance(fag, list) and fag:
            out["gruppe"] = fag[0]
        elif not grp and isinstance(fag, str) and fag.strip():
            out["gruppe"] = fag.strip()
        elif not grp:
            out["gruppe"] = "Uspesifisert"

        # Korttekst fallback
        if not out.get("short_text") and out.get("korttekst"):
            out["short_text"] = out.get("korttekst") or ""

        # Score som tall (bevar originalen i out['score'] om den allerede er tall)
        try:
            out["score"] = float(out.get("score", 0.0))
        except Exception:
            pass

        return out

    requirements = [_norm_item(x) for x in requirements if isinstance(x, dict)]

    # (valgfritt) logg hvor data kom fra – nyttig ved feilsøking
    if src_used:
        log.debug("review_data: returnerer %d krav fra %s", len(requirements), src_used)
    else:
        log.debug("review_data: fant ingen datakilde, returnerer tom liste")

    return jsonify({"ok": True, "temp_folder_id": temp_id, "requirements": requirements})


@bp.route("/save_review", methods=["POST"])
@login_required
def save_review():
    """Lagrer reviderte krav fra brukeren i temp-mappen."""
    data = request.get_json(silent=True) or {}
    temp_folder_id = data.get("temp_folder_id")
    ok, err = validate_temp_id(current_user.id, TEMP_ROOT, temp_folder_id or "")
    if not ok:
        return json_error(403 if "Uautorisert" in err else 404 if "ikke funnet" in err else 400, "invalid_temp_id", err)

    requirements = data.get("requirements")

    if not temp_folder_id or not isinstance(requirements, list):
        return jsonify({"error": "Ugyldig data. Mangler 'temp_folder_id' eller 'requirements'."}), 400
    if not temp_folder_id.startswith(f"krav_{current_user.id}_"):
        return jsonify({"error": "Uautorisert tilgang"}), 403

    temp_dir = TEMP_ROOT / temp_folder_id
    if not temp_dir.is_dir():
        return jsonify({"error": "Midlertidig mappe ikke funnet."}), 404

    try:
        # NB: Koordiner med review_data()/learn(): bruk *reviewed_requirements.json*
        (temp_dir / "reviewed_requirements.json").write_text(
            json.dumps(requirements, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return jsonify({"ok": True, "saved": len(requirements)})
    except Exception as e:
        log.error(f"Kunne ikke skrive reviewed_requirements.json: {e}", exc_info=True)
        return jsonify({"error": "En intern feil oppstod under lagring."}), 500

# ----------------------------- Retrain / ZIP -----------------------------

@bp.route("/retrain_ai", methods=["POST"])
@login_required
def retrain_ai():
    """Starter en jobb for å flette inn endringer og re-trene AI-modeller."""
    payload = request.get_json(silent=True) or {}
    temp_folder_id = (payload.get("temp_folder_id") or "").strip()
    ok, err = validate_temp_id(current_user.id, TEMP_ROOT, temp_folder_id or "")
    if not ok:
        return json_error(403 if "Uautorisert" in err else 404 if "ikke funnet" in err else 400, "invalid_temp_id", err)

    if not temp_folder_id:
        return jsonify({"ok": False, "error": "temp_folder_id mangler"}), 400
    if not temp_folder_id.startswith(f"krav_{current_user.id}_"):
        return jsonify({"ok": False, "error": "Uautorisert tilgang"}), 403

    # Start opp trening uten 'source_file' – tasken leser selv fra temp-mappen.
    try:
        task = retrain_ai_task.delay(
            user_id=int(current_user.id),
            temp_folder_id=temp_folder_id,
        )
    except Exception as e:
        current_app.logger.error("Kunne ikke starte re-trening: %s", e, exc_info=True)
        return jsonify({"ok": False, "error": "Kunne ikke starte trening."}), 500
    return jsonify({"ok": True, "job_id": task.id}), 202

@bp.route("/generate_zip_from_review", methods=["POST"])
@login_required
def generate_zip_from_review():
    """Starter Celery-jobb som bygger ZIP fra reviderte data i temp-mappen."""
    data = request.get_json(silent=True) or {}
    temp_id = (data.get("temp_folder_id") or "").strip()
    ok, err = validate_temp_id(current_user.id, TEMP_ROOT, temp_id or "")
    if not ok:
        return json_error(403 if "Uautorisert" in err else 404 if "ikke funnet" in err else 400, "invalid_temp_id", err)
    if not temp_id:
        return jsonify({"ok": False, "error": "temp_folder_id mangler"}), 400
    if not temp_id.startswith(f"krav_{current_user.id}_"):
        return jsonify({"ok": False, "error": "Uautorisert tilgang"}), 403

    # Valider at mappen finnes før vi starter jobb
    temp_dir = TEMP_ROOT / temp_id
    if not temp_dir.is_dir():
        return jsonify({"ok": False, "error": "Midlertidig mappe ikke funnet"}), 404

    # Preflight: krever at bruker har lagret review før ZIP genereres
    review_path = temp_dir / "reviewed_requirements.json"
    if not review_path.is_file():
        return jsonify({
            "ok": False,
            "error": "review_missing",
            "message": "Fant ikke reviewed_requirements.json – lagre endringer før du genererer ZIP."
        }), 409

    if zip_from_review_task is None:
        current_app.logger.error("zip_from_review_task er ikke lastet/tilgjengelig.")
        return jsonify({"ok": False, "error": "Bakgrunnsjobb ikke tilgjengelig (zip)."}), 503

    try:
        task = zip_from_review_task.delay(user_id=int(current_user.id), temp_folder_id=temp_id)
    except Exception as e:
        current_app.logger.error("Kunne ikke starte ZIP-generering: %s", e, exc_info=True)
        return jsonify({"ok": False, "error": "Kunne ikke starte ZIP-generering."}), 500

    return jsonify({"ok": True, "job_id": task.id}), 202

@bp.route("/download/<temp_folder_id>")
@login_required
def download_results(temp_folder_id):
    ok, err = validate_temp_id(current_user.id, TEMP_ROOT, temp_folder_id or "")
    if not ok:
        return json_error(403 if "Uautorisert" in err else 404 if "ikke funnet" in err else 400, "invalid_temp_id", err)

    """Sender den genererte ZIP-filen til brukeren (JSON-feil ved 403/404)."""
    if not temp_folder_id.startswith(f"krav_{current_user.id}_"):
        return jsonify({"error": "Uautorisert tilgang"}), 403

    zip_path = TEMP_ROOT / temp_folder_id / "Kravsporing_Resultater.zip"
    if not zip_path.is_file():
        # Gi en vennlig beskjed i JSON (frontend kan vise dette pent)
        return jsonify({
            "error": "not_ready",
            "message": "Resultatfilen er ikke tilgjengelig ennå. Prøv igjen om litt."
        }), 404

    return send_file(zip_path, as_attachment=True, download_name=zip_path.name)

# === Start AI-trening (Lær KI) ===
@bp.route("/learn", methods=["POST"])
@login_required
def learn():
    """
    Forventer JSON: { "temp_folder_id": "krav_<uid>_<...>" }
    Bruker reviewed_requirements.json hvis finnes, ellers requirements.json/results.json.
    """
    data = request.get_json(silent=True) or {}
    temp_id = (data.get("temp_folder_id") or "").strip()
    ok, err = validate_temp_id(current_user.id, TEMP_ROOT, temp_id or "")
    if not ok:
        return json_error(403 if "Uautorisert" in err else 404 if "ikke funnet" in err else 400, "invalid_temp_id", err)

    if not temp_id:
        return jsonify({"ok": False, "error": "temp_folder_id mangler"}), 400
    if not temp_id.startswith(f"krav_{current_user.id}_"):
        return jsonify({"ok": False, "error": "Uautorisert tilgang"}), 403

    temp_dir = TEMP_ROOT / temp_id
    if not temp_dir.is_dir():
        return jsonify({"ok": False, "error": "Midlertidig mappe ikke funnet"}), 404

    # Preflight: krever at minst én av disse finnes – tasken leser selv.
    if not any((temp_dir / n).exists() for n in ("reviewed_requirements.json", "requirements.json", "results.json")):
        return jsonify({"ok": False, "error": "Ingen treningsdata funnet i mappen."}), 409

    try:
        task = retrain_ai_task.delay(
            user_id=int(current_user.id),
            temp_folder_id=temp_id,
        )
    except Exception as e:
        current_app.logger.error("Kunne ikke starte trening: %s", e, exc_info=True)
        return jsonify({"ok": False, "error": "Kunne ikke starte trening."}), 500

    return jsonify({"ok": True, "job_id": task.id}), 202

# ----------------------------- Nøkkelord / synonymer -----------------------------
# (Eksisterende legacy-endepunkter – beholdt for bakoverkompabilitet)

@bp.route('/api/nokkelord', methods=['GET'])
@login_required
def get_nokkelord():
    """Henter hele nøkkelord-strukturen fra JSON-filen.
    Fallback: keywords.json (bakoverkompatibilitet).
    NY: Håndterer også "rot-løst" format.
    """
    try:
        primary = DATA_DIR / 'nokkelord.json'
        fallback = DATA_DIR / 'keywords.json'
        path = primary if primary.exists() else (fallback if fallback.exists() else None)
        
        if not path:
            log.warning("Fant verken nokkelord.json eller keywords.json. Returnerer tom struktur.")
            return jsonify({"fag": {}})  # Returner gyldig tom-struktur

        # Bruk utf-8-sig for å håndtere BOM (vanlig fra Windows-redigering)
        data = json.loads(path.read_text(encoding='utf-8-sig'))

        # Sjekk om det er standard legacy-format
        if _is_legacy_format(data):
            log.debug("Laster /api/nokkelord fra %s (Standard Legacy)", path.name)
            return jsonify(data)

        # --- ✅ HER ER LØSNINGEN ---
        # Sjekk om det er det "rot-løse" formatet (som du har)
        if (isinstance(data, dict) and len(data) > 0 and 
            not _is_dataset_format(data) and not _is_legacy_format(data)):
            
            log.debug("Laster /api/nokkelord fra %s (Rot-løst format). Pakker inn i {'fag': ...}", path.name)
            # Pakk den inn i forventet legacy-struktur
            wrapped_data = {"fag": data}
            
            # Sjekk at innpakningen er gyldig
            if _is_legacy_format(wrapped_data):
                return jsonify(wrapped_data)
        # --- SLUTT PÅ LØSNING ---

        # Hvis vi kommer hit, er filen tom eller i et ukjent format
        log.warning("Fil %s er tom eller i et ukjent format. Returnerer tom struktur.", path.name)
        return jsonify({"fag": {}})

    except Exception as e:
        log.error(f"Kunne ikke lese nøkkelordfilen: {e}", exc_info=True)
        return jsonify({"error": "Kunne ikke lese nøkkelordfilen.", "details": str(e)}), 500

@bp.route('/api/nokkelord', methods=['POST'])
@login_required
def save_nokkelord():
    """Mottar en JSON-struktur og overskriver nokkelord.json ( keywords.json for kompat.)."""
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({"error": "Ugyldig eller manglende JSON-data."}), 400
        primary = DATA_DIR / 'nokkelord.json'
        compat  = DATA_DIR / 'keywords.json'
        payload = json.dumps(data, indent=2, ensure_ascii=False)
        primary.write_text(payload, encoding='utf-8')
        # skriv også kompat-fil, men uten å feile hele kall hvis dette mislykkes
        try:
            compat.write_text(payload, encoding='utf-8')
        except Exception:
            log.warning("Kunne ikke oppdatere keywords.json (kompat). Fortsetter.")
        return jsonify({"status": "success", "message": "Nøkkelord er lagret."})
    except Exception as e:
        log.error(f"Kunne ikke lagre nøkkelordfilen: {e}", exc_info=True)
        return jsonify({"error": "Kunne ikke lagre nøkkelordfilen.", "details": str(e)}), 500

@bp.route("/hent_synonymer")
@login_required
def hent_synonymer():
    return jsonify(synonyms)

@bp.route("/lagre_synonymer", methods=["POST"])
@login_required
def lagre_synonymer():
    global synonyms
    data = request.get_json(silent=True) or {}
    synonyms = data
    try:
        SYNONYM_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return jsonify({"status": "ok"})
    except Exception as e:
        log.error(f"Kunne ikke lagre synonyms.json: {e}", exc_info=True)
        return jsonify({"error": "Kunne ikke lagre synonymer"}), 500


# ---- Konsolidert schema-validering -----------------------------------------
def _validate_keywords_schema(payload: dict) -> tuple[bool, str]:
    """
    Forventet schema:
    {
      "fag": {
        "<fag>": {
          "funksjoner": {
            "<funksjon>": { "nokkelord": { "<ord>": ["syn1","syn2",...] }, ... }
          }
        },
        ...
      }
    }
    """
    if not isinstance(payload, dict) or "fag" not in payload or not isinstance(payload["fag"], dict):
        return False, "Rot må være {'fag': {...}}"
    for fag, fagnode in payload["fag"].items():
        if not isinstance(fagnode, dict):
            return False, f"Fag '{fag}' må være et objekt"
        funksjoner = fagnode.get("funksjoner", {})
        if not isinstance(funksjoner, dict):
            return False, f"fag.{fag}.funksjoner må være et objekt"
        for funknavn, funknode in funksjoner.items():
            if not isinstance(funknavn, str) or not funknavn:
                return False, f"Ugyldig funksjonsnavn i fag '{fag}'"
            if not isinstance(funknode, dict):
                return False, f"fag.{fag}.funksjoner.{funknavn} må være et objekt"
            nk = funknode.get("nokkelord", {})
            if not isinstance(nk, dict):
                return False, f"fag.{fag}.funksjoner.{funknavn}.nokkelord må være et objekt"
            for base, syns in nk.items():
                if not isinstance(base, str) or not base.strip():
                    return False, f"Tomt/ugyldig nøkkelord i {fag}/{funknavn}"
                if not isinstance(syns, list) or not all(isinstance(s, str) for s in syns):
                    return False, f"Synonymliste må være liste av str for {fag}/{funknavn}/{base}"
    return True, ""

def _load_keywords() -> dict:
    if NOKKELORD_PATH.exists():
        try:
            return json.loads(NOKKELORD_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            # Korrupte filer håndteres ved å returnere tom struktur
            return {"fag": {}}
    NOKKELORD_PATH.parent.mkdir(parents=True, exist_ok=True)
    return {"fag": {}}

def _save_keywords(doc: dict) -> None:
    NOKKELORD_PATH.parent.mkdir(parents=True, exist_ok=True)
    NOKKELORD_PATH.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

# ---- Konsolidert endepunkt (GET/POST) --------------------------------------
@bp.route("/api/keywords", methods=["GET", "POST"])
@login_required
def keywords_api():
    """
    GET  -> returnerer full struktur fra nokkelord.json
    POST -> validerer og lagrer ny struktur (overstyrer hele dokumentet)
    """
    if request.method == "GET":
        return jsonify({"ok": True, "data": _load_keywords()})

    # POST
    payload = request.get_json(silent=True) or {}
    ok, err = _validate_keywords_schema(payload)
    if not ok:
        return jsonify({"ok": False, "error": f"Schema-feil: {err}"}), 400

    # Enkle normaliseringer for konsistens
    for fag, fagnode in payload["fag"].items():
        funksjoner = fagnode.get("funksjoner", {})
        for funknavn, funknode in funksjoner.items():
            nk = funknode.get("nokkelord", {})
            funknode["nokkelord"] = {
                base.strip(): sorted(set(s.strip() for s in syns if s.strip()))
                for base, syns in nk.items()
                if isinstance(base, str) and base.strip()
            }
    _save_keywords(payload)
    return jsonify({"ok": True, "saved": True, "path": str(NOKKELORD_PATH)})

# ------------------------- Ny chip-editor: dataset API -------------------------
# Hvorfor: Moderne UI (chips) forventer /kravsporing/keywords i "dataset-format".

@bp.route("/keywords", methods=["GET"])
@login_required
def get_keywords_dataset():
    """
    Returnerer dataset-formatet:
    {
      "<fag-id>": { "name": "<navn>", "concepts": [ { "id": "...", "canonical": "X", "synonyms": [...] }, ... ] },
      ...
    }
    Kildeprioritet: nokkelord.dataset.json -> nokkelord.json (auto-migrert) -> {}
    """
    try:
        # 1) Foretrukket: allerede i nytt format
        if DATASET_PATH.exists():
            raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
            if _is_dataset_format(raw):
                return jsonify(raw)

        # 2) Legacy -> migrer on-the-fly
        if NOKKELORD_PATH.exists():
            legacy = json.loads(NOKKELORD_PATH.read_text(encoding="utf-8"))
            if _is_dataset_format(legacy):
                # Filen inneholder allerede dataset (noen har byttet manuelt)
                return jsonify(legacy)
            if _is_legacy_format(legacy):
                dataset = _legacy_to_dataset(legacy)
                return jsonify(dataset)

        # 3) Tom struktur
        return jsonify({})
    except Exception as e:
        log.error("get_keywords_dataset: %s", e, exc_info=True)
        return jsonify({}), 200  # defensive: ikke 500 for editor-visning

@bp.route("/keywords", methods=["PUT"])
@login_required
def put_keywords_dataset():
    """
    Lagrer dataset-formatet (atomisk) til nokkelord.dataset.json.
    Best-effort: skriver også legacy-konvertering til nokkelord.json for bakoverkomp.
    """
    try:
        payload = request.get_json(force=True, silent=True) or {}
        if not _is_dataset_format(payload):
            return jsonify({"ok": False, "error": "invalid_format", "message": "Forventer dataset-format (groups med concepts[])"}), 400

        # Skriv ny hovedfil atomisk
        _atomic_write_json(DATASET_PATH, payload)

        # Bakoverkompabilitet (ikke-kritisk)
        try:
            legacy = _dataset_to_legacy(payload)
            _atomic_write_json(NOKKELORD_PATH, legacy)
        except Exception as e:
            # Viktig: ikke feile hele kall – bare logg
            log.warning("Kunne ikke skrive legacy-konvertering: %s", e, exc_info=True)

        return jsonify({"ok": True, "saved": True, "dataset_path": str(DATASET_PATH), "legacy_path": str(NOKKELORD_PATH)})
    except Exception as e:
        log.error("put_keywords_dataset: %s", e, exc_info=True)
        return jsonify({"ok": False, "error": "write_failed", "detail": str(e)}), 500

# ----------------------------------------------------------------------
# Eksport-alias for bakoverkompabilitet
# ----------------------------------------------------------------------
kravsporing_bp = bp
__all__ = ["bp", "kravsporing_bp"]
