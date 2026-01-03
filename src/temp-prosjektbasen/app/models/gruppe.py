# app/models/gruppe.py

from app.models.db import db

class Gruppe(db.Model):
    __tablename__ = "gruppe"

    id = db.Column(db.Integer, primary_key=True)
    fag = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    order = db.Column(db.Integer, default=0)

    # Legg til relasjon til Underpunkter
    underpunkter = db.relationship(
        "Underpunkt",
        backref="gruppe",
        cascade="all, delete-orphan",
        lazy=True
    )

    def __repr__(self):
        return f"<Gruppe {self.name} ({self.fag})>"
