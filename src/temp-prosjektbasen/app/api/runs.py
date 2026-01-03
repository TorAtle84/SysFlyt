# app/api/runs.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from celery.result import AsyncResult

from app.celery_instance import celery  # bruker eksisterende celery-app
from app.tasks import process_files_task

router = APIRouter(prefix="/runs", tags=["runs"])

@router.get("/ping")
def ping():
    return {"status": "ok", "from": "runs"}

class StartRunRequest(BaseModel):
    temp_dir_path: str
    keywords: List[str] = []
    min_score: Optional[float] = 80
    ns_standard_selection: str = "Ingen"
    mode: str = "keywords_ai"
    selected_groups: List[str] = []
    fokusomraade: str = ""
    ai_opts: Dict[str, Any] = {}

@router.post("/start")
def start_run(payload: StartRunRequest):
    # Start Celery-jobben
    task = process_files_task.delay(
        temp_dir_path=payload.temp_dir_path,
        keywords=payload.keywords,
        min_score=payload.min_score or 80,
        user_id=0,  # sett faktisk bruker-ID hvis du har
        ns_standard_selection=payload.ns_standard_selection,
        mode=payload.mode,
        selected_groups=payload.selected_groups,
        fokusomraade=payload.fokusomraade,
        ai_opts=payload.ai_opts or {}
    )
    return {"accepted": True, "task_id": task.id}

@router.get("/status/{task_id}")
def status(task_id: str):
    res = AsyncResult(task_id, app=celery)
    return {"task_id": task_id, "state": res.state, "info": res.info}

@router.get("/result/{task_id}")
def result(task_id: str):
    res = AsyncResult(task_id, app=celery)
    if not res.ready():
        return {"task_id": task_id, "state": res.state}
    if res.failed():
        raise HTTPException(status_code=500, detail=str(res.info))
    return {"task_id": task_id, "state": res.state, "result": res.get()}
