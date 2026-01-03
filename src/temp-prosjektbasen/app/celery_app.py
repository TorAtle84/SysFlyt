# app/celery_app.py
from __future__ import annotations
import os
from celery import Celery

# Les broker/result fra env eller bruk Redis som default
BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery = Celery(
    "kravsporing",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=["app.tasks.main"],  # pek direkte på modul som registrerer tasks
)

# Valgfritt oppsett
celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Oslo",
    enable_utc=True,
)

# Alternativt (i tillegg eller i stedet): autodiscover i hele pakken
celery.autodiscover_tasks(["app.tasks"])
