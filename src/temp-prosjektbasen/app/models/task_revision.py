from datetime import datetime
from .db import db

class TaskRevision(db.Model):
    __tablename__ = 'task_revisions'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id', ondelete="CASCADE"), nullable=False)

    task = db.relationship('Task', back_populates='revisions')

    ics_sequence = db.Column(db.Integer, nullable=False)

    change_date = db.Column(db.DateTime, default=datetime.utcnow)
    changed_by = db.Column(db.String(100), nullable=True)

    old_title = db.Column(db.String(255))
    old_status = db.Column(db.String(50))  # NY
    old_start_date = db.Column(db.Date)
    old_start_time = db.Column(db.Time)
    old_end_date = db.Column(db.Date)
    old_end_time = db.Column(db.Time)
    old_technician = db.Column(db.String(100))

    new_title = db.Column(db.String(255))
    new_status = db.Column(db.String(50))  # NY
    new_start_date = db.Column(db.Date)
    new_start_time = db.Column(db.Time)
    new_end_date = db.Column(db.Date)
    new_end_time = db.Column(db.Time)
    new_technician = db.Column(db.String(100))

    def __repr__(self):
        return f"<TaskRevision {self.id} for Task {self.task_id} (Seq: {self.ics_sequence})>"
