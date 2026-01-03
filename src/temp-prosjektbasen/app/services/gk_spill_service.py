from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import desc

from app.models.db import db
from app.models.gk_spill import GKSpillHighscore

NAME_PATTERN = re.compile(r"^[A-ZÅÆØa-zåæø0-9 _-]{1,12}$")
HIGHSCORE_LIMIT = 5
MAX_SCORE = 1_000_000_000


def _serialize(record: GKSpillHighscore) -> Dict[str, object]:
    return {
        "id": record.id,
        "name": record.name,
        "score": record.score,
        "created_at": record.created_at.isoformat(),
    }


def list_highscores(limit: int = HIGHSCORE_LIMIT) -> List[Dict[str, object]]:
    """Returner topp-liste med høyeste poengsummer."""
    records = (
        GKSpillHighscore.query.order_by(
            desc(GKSpillHighscore.score), desc(GKSpillHighscore.created_at)
        )
        .limit(limit)
        .all()
    )
    return [_serialize(record) for record in records]


def submit_highscore(name: str, score: object, limit: int = HIGHSCORE_LIMIT) -> Dict[str, object]:
    """Lagret en ny highscore dersom den kvalifiserer til topp-listen."""
    cleaned_name = (name or "").strip()
    if not cleaned_name or not NAME_PATTERN.fullmatch(cleaned_name):
        raise ValueError("ugyldig_navn")

    try:
        score_value = int(score)
    except (TypeError, ValueError):
        raise ValueError("ugyldig_score")

    if score_value < 0 or score_value > MAX_SCORE:
        raise ValueError("ugyldig_score")

    current_top = (
        GKSpillHighscore.query.order_by(
            desc(GKSpillHighscore.score), desc(GKSpillHighscore.created_at)
        )
        .limit(limit)
        .all()
    )
    qualifies = len(current_top) < limit
    if not qualifies and current_top:
        qualifies = score_value >= current_top[-1].score

    if not qualifies:
        return {
            "inserted": False,
            "qualifies": False,
            "highscores": [_serialize(record) for record in current_top],
            "entry": None,
        }

    record = GKSpillHighscore(
        name=cleaned_name,
        score=score_value,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(record)
    db.session.flush()

    # Fjern alle som faller utenfor topp-listen.
    excess = (
        GKSpillHighscore.query.order_by(
            desc(GKSpillHighscore.score), desc(GKSpillHighscore.created_at)
        )
        .offset(limit)
        .all()
    )
    for item in excess:
        db.session.delete(item)

    db.session.commit()
    db.session.refresh(record)

    highscores = list_highscores(limit)
    return {
        "inserted": True,
        "qualifies": True,
        "highscores": highscores,
        "entry": _serialize(record),
    }
