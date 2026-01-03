from .db import db

class Attachment(db.Model):
    __tablename__ = 'attachment'

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    path = db.Column(db.String(255), nullable=False)

    task_id = db.Column(
        db.Integer,
        db.ForeignKey('task.id', ondelete="CASCADE"),
        nullable=False
    )

    task = db.relationship('Task', back_populates='attachments')

    def __repr__(self):
        return f"<Attachment {self.id}: {self.filename}>"
