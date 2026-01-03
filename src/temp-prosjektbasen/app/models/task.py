from .db import db

class Task(db.Model):
    __tablename__ = 'task'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    order_number = db.Column(db.String(100), nullable=True)

    start_date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=True)
    end_date = db.Column(db.Date, nullable=False)
    end_time = db.Column(db.Time, nullable=True)

    status = db.Column(db.String(50), nullable=False)
    technician = db.Column(db.String(100), nullable=True)
    location = db.Column(db.String(50), nullable=False)
    fag = db.Column(db.String(50), nullable=True)
    plassering = db.Column(db.String(255))
    kommentar = db.Column(db.Text)
    teknikerKommentar = db.Column(db.Text)

    customer_name = db.Column(db.String(100), nullable=True)
    customer_phone = db.Column(db.String(50), nullable=True)
    customer_email = db.Column(db.String(100), nullable=True)
    opprettet_av = db.Column(db.String, nullable=True)

    ics_uid = db.Column(db.String(255), nullable=True)
    ics_sequence = db.Column(db.Integer, default=0)

    # === DIREKTE: Relasjoner ===
    attachments = db.relationship(
        'Attachment',
        back_populates='task',
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy=True
    )

    revisions = db.relationship(
        'TaskRevision',
        back_populates='task',
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy=True
    )

    def __repr__(self):
        return f"<Task {self.id}: {self.title}>"
