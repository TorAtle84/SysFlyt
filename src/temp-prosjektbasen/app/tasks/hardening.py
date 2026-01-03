# app/tasks/hardening.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

from werkzeug.utils import secure_filename as _secure_filename
from flask import jsonify, request

SAFE_TEMP_PREFIX = "krav_"

def new_request_id() -> str:
    return uuid.uuid4().hex

def with_request_id(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Why: konsistent korrelasjons-ID i logger/svar for feilsøking
    rid = getattr(request, "request_id", None)
    if not rid:
        try:
            rid = request.headers.get("X-Request-ID") or new_request_id()
        except Exception:
            rid = new_request_id()
    return {**payload, "request_id": rid}

def json_error(status_code: int, error: str, message: str, **extra):
    resp = with_request_id({"ok": False, "error": error, "message": message, **extra})
    return jsonify(resp), int(status_code)

def secure_filename(name: str) -> str:
    name = re.sub(r"[\x00-\x1F\x7F]+", "", name or "")
    name = _secure_filename(name)
    return name or f"file_{int(time.time())}"

def validate_upload(
    files: Iterable, max_files: int, total_limit_mb: int, allowed_exts: set[str]
) -> Tuple[bool, str]:
    lst = [f for f in (files or []) if f and getattr(f, "filename", None)]
    if not lst:
        return False, "Ingen filer valgt"
    if len(lst) > max_files:
        return False, f"For mange filer. Maks {max_files}."
    total = request.content_length or 0
    if not total:
        try:
            total = sum(int(getattr(f, "content_length", 0) or 0) for f in lst)
        except Exception:
            total = 0
    if total and total > total_limit_mb * 1024 * 1024:
        return False, f"For stor total opplasting (> {total_limit_mb} MB)."
    for f in lst:
        ext = Path(f.filename).suffix.lower()
        if ext not in allowed_exts:
            return False, f"Ugyldig filtype: {f.filename}"
    return True, ""

def validate_temp_id(user_id: int, temp_root: Path, temp_id: str) -> Tuple[bool, str]:
    if not temp_id or not isinstance(temp_id, str):
        return False, "temp_folder_id mangler"
    if not temp_id.startswith(f"{SAFE_TEMP_PREFIX}{user_id}_"):
        return False, "Uautorisert tilgang"
    p = temp_root / temp_id
    if not p.is_dir():
        return False, "Midlertidig mappe ikke funnet"
    return True, ""

def parse_json(payload: Any, schema: Dict[str, type]) -> Tuple[bool, Dict[str, Any] | str]:
    if not isinstance(payload, dict):
        return False, "Ugyldig JSON (forventet objekt)"
    out: Dict[str, Any] = {}
    for key, typ in schema.items():
        val = payload.get(key)
        if val is None:
            return False, f"Mangler felt: {key}"
        if typ is list and not isinstance(val, list):
            return False, f"Felt {key} må være liste"
        if typ is dict and not isinstance(val, dict):
            return False, f"Felt {key} må være objekt"
        if typ not in (list, dict) and not isinstance(val, typ):
            return False, f"Felt {key} har feil type"
        out[key] = val
    return True, out

def attach_request_id(response):
    try:
        rid = getattr(request, "request_id", None) or request.headers.get("X-Request-ID") or new_request_id()
        response.headers["X-Request-ID"] = rid
    except Exception:
        pass
    return response