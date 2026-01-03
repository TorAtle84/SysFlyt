from app.models.db import db

class Systembygging(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, nullable=False)
    full_id = db.Column(db.String(255), nullable=False)
    desc = db.Column(db.Text, nullable=True)
    files = db.Column(db.Text, nullable=True)
