from app.models.db import db

class Merkskilt(db.Model):
    __tablename__ = 'merkeskilt_posts'

    id           = db.Column(db.Integer, primary_key=True)
    project_id   = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    komponent_id = db.Column(db.String(100), nullable=False)
    beskrivelse  = db.Column(db.String(255), nullable=True)
    aktiv        = db.Column(db.Boolean, default=False)
    inaktiv      = db.Column(db.Boolean, default=False)

    def __repr__(self):
        return f'<MerkskiltPost {self.komponent_id}→proj{self.project_id}>'
