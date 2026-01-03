from app.models.db import db

class Fag(db.Model):
    __tablename__ = 'fag'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)