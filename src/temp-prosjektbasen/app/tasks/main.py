# app/tasks/main.py
# -*- coding: utf-8 -*-
"""
Primær Celery-task for kravsporing. Koordinerer parsing → core → rapportering.

VIKTIG: Modeller lastes NÅ inne i task-funksjonen for å sikre at den nyeste
trente modellen alltid brukes.
"""
from __future__ import annotations

import logging
import json
from pathlib import Path
from typing import Iterable, Any, Dict

# Celery-instans
from app.celery_instance import celery

# Våre moduler (flytter model-import inn i task)
from .parsing import _process_single_document
from .reporting import create_reports_and_zip
from .core import (
    deduplicate_requirements,
    _sort_requirements,
    classify_group_ai, # Antar denne bruker modellen lastet via reload_fag_model
    _generate_short_text,
)

# FJERNET global modell-lasting herfra

# Hold dette i sync med web-laget (routes/kravsporing.py)
ALLOWED_EXTS = {".pdf", ".docx", ".doc", ".txt", ".xlsx", ".msg"}

# FJERNET global modell-lasting herfra


class ProgressProxy:
    """Wrapper for Celery-task som tvinger all state til PROGRESS."""
    # ... (resten av ProgressProxy er uendret) ...
    def __init__(self, real_task, logger: logging.Logger | None = None):
        self._real = real_task
        self._log = logger or logging.getLogger(__name__)

    def update_state(self, state: str = "PROGRESS", meta: Dict[str, Any] | None = None, **kw):
        meta = meta or {}
        if state and state.upper() == "FAILURE":
            self._log.warning("Intercepted update_state(FAILURE) i underfunksjon – nedgraderer til PROGRESS...")
            state = "PROGRESS"
            meta = {**meta, "_downgraded_from": "FAILURE"}
        try:
            return self._real.update_state(state=state, meta=meta, **kw)
        except Exception:
            self._log.warning("update_state feilet (ignorerer).", exc_info=True)
            return None


def _safe_update_state(task, **meta):
    """Robust oppdatering av Celery state."""
    # ... (uendret) ...
    try:
        task.update_state(state=meta.pop("state", "PROGRESS"), meta=meta)
    except Exception:
        logging.getLogger(__name__).warning("update_state feilet (ignorerer).", exc_info=True)


def _progress(task, temp_id: str, status: str, current: int):
    """Sender PROGRESS state."""
    # ... (uendret) ...
    _safe_update_state(
        task,
        state="PROGRESS",
        status=status,
        current=int(max(0, min(current, 100))),
        total=100,
        temp_folder_id=temp_id,
    )

def _iter_files(dirpath: Path) -> Iterable[Path]:
    """Deterministisk, filtrert liste over filer."""
    # ... (uendret) ...
    files = [f for f in dirpath.iterdir() if f.is_file()]
    files = [f for f in files if f.suffix.lower() in ALLOWED_EXTS or not f.suffix]
    return sorted(files, key=lambda p: p.name.lower())


@celery.task(bind=True, name="app.tasks.process_files_task",
             soft_time_limit=1800, time_limit=1860)
def process_files_task(
    self,
    temp_dir_path: str,
    keywords,
    min_score,
    user_id: int,
    ns_standard_selection: str,
    mode: str,
    selected_groups,
    fokusomraade: str,
    ai_settings: dict,
):
    log = logging.getLogger(__name__)
    temp_dir = Path(temp_dir_path)
    temp_id = temp_dir.name

    # Bruk proxy til dyplag
    progress = ProgressProxy(self, logger=log)

    # ---------- Init ----------
    _progress(self, temp_id, "Starter…", 0)

    # --- ✅ VIKTIG: Last inn modellen HVER gang tasken kjører ---
    try:
        # Importer modellenes laste-logikk her inne
        from app.tasks import models as model_loader
        if hasattr(model_loader, "reload_fag_model"):
            reloaded_ok = model_loader.reload_fag_model()
            if reloaded_ok:
                log.info("Fag-modell lastet/reloadet for denne tasken.")
            else:
                log.warning("Fag-modell ble IKKE reloadet, bruker muligens gammel versjon.")
        else:
            log.warning("Funksjonen 'reload_fag_model' ikke funnet i app.tasks.models.")
        # TODO: Vurder å laste krav_validator-modellen her også hvis den brukes i denne tasken
    except Exception as model_err:
        # Ikke stopp hele tasken, men logg tydelig
        log.error("KRITISK FEIL ved lasting av AI-modell: %s", model_err, exc_info=True)
        # Du kan vurdere å sette en feilmelding i resultatet her,
        # eller la tasken fortsette med evt. default/gammel modell hvis mulig.
        # For nå lar vi den prøve å fortsette.
    # --- SLUTT PÅ MODELL-LASTING ---


    if not temp_dir.exists():
        msg = f"Midlertidig mappe finnes ikke: {temp_dir}"
        log.error(msg)
        return {
            "status": "Feil: midlertidig mappe mangler",
            "zip_folder": temp_id, "temp_folder_id": temp_id,
            "errors": [msg], "preview": {"requirements": []},
        }

    files_to_process = list(_iter_files(temp_dir))
    total_files = len(files_to_process)

    processing_errors: list[str] = []
    initial_requirements: list[dict] = []

    if total_files == 0:
        log.warning("Ingen filer å prosessere i %s", temp_dir)
        return {
            "status": "Ingen filer å behandle",
            "zip_folder": temp_id, "temp_folder_id": temp_id,
            "errors": ["Ingen filer å prosessere"], "preview": {"requirements": []},
        }

    # ---------- Hovedsløyfe ----------
    for idx, fpath in enumerate(files_to_process, start=1):
        pct = 5 + int(60 * idx / max(1, total_files))
        _progress(self, temp_id, f"Behandler fil {idx}/{total_files}: {fpath.name}", pct)

        try:
            # Kall parsing (send proxy i stedet for ekte task)
            reqs, errs = _process_single_document(
                self_task=progress,
                file_path=fpath,
                keywords=keywords or [],
                min_score=float(min_score),
                ns_standard_selection=ns_standard_selection,
                mode=mode,
                fokusomraade=fokusomraade or "",
                selected_groups=selected_groups or [],
                # Pass på at _process_single_document bruker den nylig lastede modellen
                # (enten via import i den funksjonen eller ved å passere modellobjektet)
            )

            # Berik (uendret)
            for r in reqs or []:
                txt = r.get("text", "") or ""
                if "fag" not in r:
                    # Antar classify_group_ai bruker den siste lastede modellen
                    best_fag, _ = classify_group_ai(txt)
                    r["fag"] = [best_fag or "Uspesifisert"]
                elif isinstance(r["fag"], str):
                    r["fag"] = [r["fag"]]
                if "status" not in r:
                    r["status"] = "Aktiv"
                st = r.get("short_text") or r.get("korttekst")
                if not st: st = _generate_short_text(txt)
                r["short_text"] = st
                r["korttekst"] = st

            initial_requirements.extend(reqs or [])
            processing_errors.extend(errs or [])

        except Exception as e:
            msg = f"Feil ved behandling av {fpath.name}: {e}"
            log.error(msg, exc_info=True)
            processing_errors.append(msg)

    # ---------- Lagre rå funn ----------
    try:
        _progress(self, temp_id, "Lagrer rå funn…", 70)
        initial_path = temp_dir / "initial_requirements.json"
        with open(initial_path, "w", encoding="utf-8") as f:
            json.dump(initial_requirements, f, ensure_ascii=False, indent=2)
    except Exception as e:
        processing_errors.append(f"Feil ved lagring av initial_requirements.json: {e}")

    # ---------- Etterbehandling ----------
    final_requirements = []
    try:
        _progress(self, temp_id, "Etterbehandler funn…", 80)
        filtered = [r for r in (initial_requirements or []) if float(r.get("score", 0.0)) >= float(min_score)]
        deduped = deduplicate_requirements(filtered, threshold=93, scope="per_file")
        final_requirements = _sort_requirements(deduped or [])
    except Exception as e:
        processing_errors.append(f"Feil i etterbehandling av krav: {e}")
        final_requirements = initial_requirements # Fallback til ubehandlet

    # ---------- Rapporter ZIP ----------
    try:
        _progress(self, temp_id, "Genererer rapporter og ZIP…", 90)
        create_reports_and_zip(final_requirements, temp_dir, processing_errors, progress)
    except Exception as e:
        processing_errors.append(f"Generering av rapport/ZIP feilet: {e}")
        # Ikke raise her, vi vil returnere det vi har
        log.error("Feil under ZIP-generering", exc_info=True)


    # ---------- Ferdig ----------
    _progress(self, temp_id, "Ferdigstiller…", 98)
    result_payload = {
        "status": "Rapport generert!",
        "zip_folder": temp_id, "temp_folder_id": temp_id,
        "errors": processing_errors,
        "preview": {"requirements": final_requirements},
    }
    return result_payload


# ======================================================================
#  NY: Generer ZIP fra reviderte data (uendret)
# ======================================================================
@celery.task(bind=True, name="app.tasks.generate_zip_from_review_task")
def generate_zip_from_review_task(self, user_id: int, temp_folder_id: str):
    # ... (denne funksjonen er uendret) ...
    log = logging.getLogger(__name__)
    _progress(self, temp_folder_id, "Leser reviderte krav…", 10)
    temp_root = Path(__file__).resolve().parent.parent / "temp"
    temp_dir = temp_root / temp_folder_id
    if not temp_dir.is_dir(): return {"ok": False, "error": "temp_dir_missing", "detail": str(temp_dir)}
    review_path = temp_dir / "reviewed_requirements.json"
    if not review_path.is_file(): return {"ok": False, "error": "review_file_missing", "detail": str(review_path)}
    try:
        reviewed = json.loads(review_path.read_text(encoding="utf-8"))
        if not isinstance(reviewed, list): return {"ok": False, "error": "invalid_review_format"}
    except Exception as e:
        return {"ok": False, "error": "review_read_failed", "detail": str(e)}
    for r in reviewed:
        r.setdefault("short_text", r.get("korttekst") or "")
        r.setdefault("status", r.get("status") or "Aktiv")
        if isinstance(r.get("fag"), str): r["fag"] = [r["fag"]]
    _progress(self, temp_folder_id, "Genererer rapporter og ZIP…", 70)
    errors: list[str] = []
    try:
        create_reports_and_zip(reviewed, temp_dir, errors, task_instance=self)
    except Exception as e:
        errors.append(f"ZIP-generering feilet: {e}")
        raise
    _progress(self, temp_folder_id, "Ferdig.", 100)
    return {"ok": True, "status": "Rapport generert fra reviderte data",
            "temp_folder_id": temp_folder_id, "zip_folder": temp_folder_id, "errors": errors}


# ======================================================================
#  NY: Re-trening av AI (uendret)
# ======================================================================
@celery.task(bind=True, name="app.tasks.retrain_ai_task")
def retrain_ai_task(self, user_id: int, temp_folder_id: str):
    # ... (denne funksjonen er uendret) ...
    log = logging.getLogger(__name__)
    _progress(self, temp_folder_id, "Forbereder data til trening…", 10)
    temp_root = Path(__file__).resolve().parent.parent / "temp"
    temp_dir = temp_root / temp_folder_id
    review_path = temp_dir / "reviewed_requirements.json"
    if not review_path.is_file(): return {"ok": False, "error": "review_file_missing", "detail": str(review_path)}
    try:
        reviewed = json.loads(review_path.read_text(encoding="utf-8"))
        if not isinstance(reviewed, list): return {"ok": False, "error": "invalid_review_format"}
    except Exception as e:
        return {"ok": False, "error": "review_read_failed", "detail": str(e)}
    try:
        from app.training_logic import learn_from_payload, run_training
        # Viktig: importer modellenes reload-funksjon her også
        from app.tasks import models as model_loader
    except Exception as e:
        return {"ok": False, "error": "training_logic_import_failed", "detail": str(e)}
    _progress(self, temp_folder_id, "Oppdaterer korpus…", 30)
    learn_stats = learn_from_payload({"requirements": reviewed})
    _progress(self, temp_folder_id, "Starter trening…", 60)
    train_res = run_training()
    reloaded = False
    try:
        # Prøv å reloade modellen i *denne* prosessen også etter trening
        if hasattr(model_loader, "reload_fag_model"):
            reloaded = bool(model_loader.reload_fag_model())
    except Exception: reloaded = False
    _progress(self, temp_folder_id, "Fullfører…", 95)
    return {"ok": bool(train_res.get("fag_ok") or train_res.get("val_ok")),
            "temp_folder_id": temp_folder_id, "learn_stats": learn_stats,
            "training": train_res, "model_reloaded": reloaded}