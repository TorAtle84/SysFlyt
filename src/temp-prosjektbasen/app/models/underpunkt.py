# app/models/underpunkt.py

from app.models.db import db

class Underpunkt(db.Model):
    __tablename__ = "underpunkt"

    id = db.Column(db.Integer, primary_key=True)
    gruppe_id = db.Column(db.Integer, db.ForeignKey('gruppe.id', ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    order = db.Column(db.Integer, default=0)
    default_count = db.Column(db.Float, default=0)
    default_time = db.Column(db.Float, default=0)

    def __repr__(self):
        return f"<Underpunkt {self.name} (Gruppe ID {self.gruppe_id})>"
