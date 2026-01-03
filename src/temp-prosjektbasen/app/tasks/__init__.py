# app/tasks/__init__.py
# -*- coding: utf-8 -*-
"""
Aggregator for Celery tasks og delmoduler etter refaktorering.
Sikrer at `from app.tasks import process_files_task, generate_zip_from_review_task, retrain_ai_task`
fungerer stabilt uansett importrekkefølge.
"""

# -- Obligatorisk hovedtask (skanning) --
from .main import process_files_task  # noqa: F401

# -- Valgfrie trening/ZIP-tasks (kan mangle i enkelte oppsett) --
try:
    # Disse ligger i app/tasks/training.py (ikke å forveksle med app/training_logic.py)
    from .training import (  # noqa: F401
        generate_zip_from_review_task,
        retrain_ai_task,
    )
except Exception:
    # Gjør API-et forutsigbart selv om modul mangler
    generate_zip_from_review_task = None  # type: ignore
    retrain_ai_task = None  # type: ignore

# -- Eksponer ofte brukte delmoduler for intern bruk --
from . import core as core        # noqa: F401
from . import models as models    # noqa: F401
from . import parsing as parsing  # noqa: F401
from . import reporting as reporting  # noqa: F401

__all__ = [
    "process_files_task",
    "generate_zip_from_review_task",
    "retrain_ai_task",
    "core",
    "models",
    "parsing",
    "reporting",
]
