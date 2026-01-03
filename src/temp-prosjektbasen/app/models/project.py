from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.dialects.sqlite import JSON
from app.models.db import db
from datetime import datetime

class Project(db.Model):
    __tablename__ = 'projects' # Navnet på tabellen i databasen

    id = db.Column(db.Integer, primary_key=True)
    project_name = db.Column(db.String(255), nullable=False)
    order_number = db.Column(db.String(100), unique=True, nullable=False) # Ordrenummer må være unikt
    location = db.Column(db.String(50), nullable=False) # Henter fra eksisterende lokasjoner
    project_leader_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) # ForeignKey til User.id
    project_manager_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) # Valgfri ForeignKey
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow) # Tidsstempel for når prosjektet ble opprettet

    # Relasjoner for enkel tilgang til brukerobjekter
    project_leader = db.relationship('User', foreign_keys=[project_leader_id], backref='led_projects')
    project_manager = db.relationship('User', foreign_keys=[project_manager_id], backref='managed_projects')
    time_usage = db.Column(MutableDict.as_mutable(JSON))


    def __repr__(self):
        return f'<Project {self.project_name} - {self.order_number}>'

    def to_dict(self):
        """Konverterer prosjektobjektet til en ordbok for JSON-serialisering."""
        return {
            'id': self.id,
            'project_name': self.project_name,
            'order_number': self.order_number,
            'location': self.location,
            'project_leader_id': self.project_leader_id,
            'project_leader_name': f"{self.project_leader.first_name} {self.project_leader.last_name}" if self.project_leader else None,
            'project_manager_id': self.project_manager_id,
            'project_manager_name': f"{self.project_manager.first_name} {self.project_manager.last_name}" if self.project_manager else None,
            'description': self.description,
            'created_at': self.created_at.isoformat()
        }

@property
def time_usage_data(self):
    return json.loads(self.time_usage or '{}')

@time_usage_data.setter
def time_usage_data(self, value):
    self.time_usage = json.dumps(value)
    