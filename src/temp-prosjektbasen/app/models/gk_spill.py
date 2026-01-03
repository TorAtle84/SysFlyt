from datetime import datetime, timezone

from app.models.db import db


class GKSpillHighscore(db.Model):
    __tablename__ = "gk_spill_highscores"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(12), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:  # pragma: no cover - representasjon for debugging
        return f"<GKSpillHighscore id={self.id} name={self.name!r} score={self.score}>"
