# app/celery_instance.py
import os
import logging
from celery import Celery
from celery.signals import worker_ready

log = logging.getLogger(__name__)

# ---- Konfig via miljøvariabler (med fornuftige default-verdier) ----
BROKER_URL = os.environ.get("CELERY_BROKER_URL", os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

# ---- Opprett Celery-app med STABILT navn og inkluder task-modulen ----
# Viktig: Vi inkluderer *modulen* som faktisk definerer @celery.task (app.tasks.main)
celery = Celery("app", broker=BROKER_URL, backend=RESULT_BACKEND, include=["app.tasks.main"])

celery.conf.result_backend_transport_options = {
    "global_keyprefix": "ks:",
    "retry_on_timeout": True,
}

# ---- Grunnleggende innstillinger ----
celery.conf.update(
    # Serialisering
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Tid/soner
    timezone="Europe/Oslo",
    enable_utc=True,

    # Drift/robusthet
    task_track_started=True,        # eksponér "STARTED" for bedre fremdriftsinfo
    task_acks_late=True,            # ikke mist jobber ved worker-krasj
    worker_prefetch_multiplier=1,   # jevnere fordeling av jobber
    task_time_limit=60 * 60,        # hard limit: 60 min
    task_soft_time_limit=55 * 60,   # soft limit: 55 min
    result_expires=24 * 60 * 60,    # resultater utløper etter 24 timer

    # Ressursgrenser per prosess (valgfritt, men fornuftig)
    worker_max_tasks_per_child=100,
    worker_max_memory_per_child=500_000,  # ca 500 MB
)

# ---- (Valgfritt) Ruting/køer om du trenger dedikerte workers pr kø ----
# celery.conf.task_routes = {
#     "app.tasks.process_files_task": {"queue": "default"},
# }

# Tips for oppstart av worker (fra prosjektroten):
#   celery -A app.celery_instance.celery worker -l info
#
# Eksempel på å trigge en oppgave:
#   from app.tasks.main import process_files_task
#   process_files_task.delay(temp_dir_path, keywords, min_score, user_id, ns, mode, selected_groups, fokusomraade, ai_settings)


# =====================================================================
# Én-gangs SCRUB ved oppstart (valgfri, styrt av miljøvariabler)
# - Rydder *korrupte* task-meta i result-backend (f.eks. mangler exc_type)
# - Kan (valgfritt) purge hele broker-køen (kun dev!), kjører KUN én gang pr worker-start
# =====================================================================

SCRUB_ON_START = os.environ.get("KS_SCRUB_RESULTS_ON_START", "0") == "1"
PURGE_BROKER_ON_START = os.environ.get("KS_PURGE_BROKER_ON_START", "0") == "1"
SCRUB_PATTERN = os.environ.get("KS_SCRUB_PATTERN", "celery-task-meta-*")
SCRUB_MAX_KEYS = int(os.environ.get("KS_SCRUB_MAX_KEYS", "10000"))


def _scrub_result_backend_once():
    backend = celery.backend
    name = backend.__class__.__name__
    log.info("[SCRUB] Starter scrub av result-backend: %s", name)

    # Redis-backend: iterér over celery-task-meta-*
    if hasattr(backend, "client") and hasattr(backend, "get_key_for_task"):
        client = backend.client
        deleted = 0
        scanned = 0
        try:
            for key in client.scan_iter(match=SCRUB_PATTERN, count=1000):
                if scanned >= SCRUB_MAX_KEYS:
                    break
                scanned += 1
                try:
                    key_str = key.decode() if isinstance(key, bytes) else str(key)
                    # Hopp over åpenbare hjelpe-nøkler
                    if key_str.endswith(("-backup", "-lock")):
                        client.delete(key)
                        deleted += 1
                        continue
                    # Ekstraher task_id og la Celery selv validere med get_task_meta
                    prefix = "celery-task-meta-"
                    task_id = key_str[len(prefix):] if key_str.startswith(prefix) else None
                    if not task_id:
                        continue
                    try:
                        backend.get_task_meta(task_id)  # vil kaste hvis korrupt
                    except Exception:
                        client.delete(key)
                        deleted += 1
                except Exception:
                    # Beskyttende – ikke stopp hele scrub på enkeltfeil
                    log.warning("[SCRUB] Feil ved inspeksjon av nøkkel – sletter: %r", key, exc_info=True)
                    try:
                        client.delete(key)
                        deleted += 1
                    except Exception:
                        pass
        finally:
            log.info("[SCRUB] Redis: skannet=%s, slettet=%s (pattern=%r)", scanned, deleted, SCRUB_PATTERN)
        return

    # Database-backend: ikke masserader som default (kan være farlig i prod)
    # Tips: implementer selektiv scrub via admin-script, eller slett rader hvor decoding feiler.
    if hasattr(backend, "ResultSession") and hasattr(backend, "task_cls"):
        log.info("[SCRUB] DB-backend oppdaget – hopp over automatisk sletting. Bruk admin-script ved behov.")
        return

    log.info("[SCRUB] Ukjent backend-type – ingen handling.")


@worker_ready.connect
def _on_worker_ready(sender, **kwargs):
    # Kjør KUN i hovedprosessen når workeren er klar
    app = sender.app if sender else celery

    if SCRUB_ON_START:
        try:
            _scrub_result_backend_once()
        except Exception:
            log.warning("[SCRUB] Feilet under scrub av result-backend (fortsetter).", exc_info=True)

    if PURGE_BROKER_ON_START:
        # ⚠️ ADVARSEL: Purge sletter ALLE ventende meldinger i standard-køen. Bruk kun i dev/test.
        try:
            purged = app.control.purge()
            log.warning("[SCRUB] PURGE broker-kø: slettet %s ventende meldinger.", purged)
        except Exception:
            log.warning("[SCRUB] Purge av broker feilet (fortsetter).", exc_info=True)
