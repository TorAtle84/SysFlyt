from .db import db

class Komponentopptelling(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, nullable=False)
    komponent = db.Column(db.String(255))
    desc = db.Column(db.Text)
    count = db.Column(db.Integer)
    has_system = db.Column(db.Boolean)
    files = db.Column(db.Text)