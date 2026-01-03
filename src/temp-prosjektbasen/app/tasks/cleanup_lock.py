# app/tasks/cleanup_lock.py
# -*- coding: utf-8 -*-
from __future__ import annotations
import time
from pathlib import Path

class CleanupLock:
    """Best-effort fil-lås for å unngå parallelle cleanups."""
    def __init__(self, lock_path: Path, ttl_seconds: int = 600):
        self.path = lock_path
        self.ttl = int(ttl_seconds)
        self.acquired = False

    def acquire(self) -> bool:
        now = int(time.time())
        try:
            if self.path.exists():
                try:
                    old = int(self.path.read_text().strip() or "0")
                except Exception:
                    old = 0
                if now - old < self.ttl:
                    return False
            self.path.write_text(str(now))
            self.acquired = True
            return True
        except Exception:
            # Why: cleanup er best-effort, lås skal ikke blokkere ryddejobben helt
            return True

    def release(self):
        if not self.acquired:
            return
        try:
            self.path.unlink(missing_ok=True)
        except Exception:
            pass
        self.acquired = False