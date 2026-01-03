from __future__ import annotations

from datetime import datetime

from app.models.db import db

__all__ = [
    "SluplanProject",
    "SluplanTask",
    "SluplanPerson",
    "SluplanDiscipline",
    "SluplanComment",
    "SluplanFile",
    "SluplanDependency",
]

class SluplanProject(db.Model):
    __tablename__ = "sluplan_projects"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    order_number = db.Column(db.String(100))
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"))

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project = db.relationship("Project", backref=db.backref("sluplan_projects", lazy="dynamic"))


class SluplanPerson(db.Model):
    __tablename__ = "sluplan_persons"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), unique=True, nullable=False)
    email = db.Column(db.String(128))
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SluplanDiscipline(db.Model):
    __tablename__ = "sluplan_disciplines"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), unique=True, nullable=False)
    color = db.Column(db.String(16))

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SluplanTask(db.Model):
    __tablename__ = "sluplan_tasks"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(64), nullable=False, default="planlagt")
    kind = db.Column(db.String(32), nullable=False, default="task")

    project_id = db.Column(db.Integer, db.ForeignKey("sluplan_projects.id"), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("sluplan_tasks.id"))
    assignee_id = db.Column(db.Integer, db.ForeignKey("sluplan_persons.id"))
    discipline_id = db.Column(db.Integer, db.ForeignKey("sluplan_disciplines.id"))

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    parent = db.relationship(
        "SluplanTask",
        remote_side=[id],
        backref=db.backref("children", cascade="all, delete-orphan", order_by="SluplanTask.start_date"),
    )
    assignee = db.relationship("SluplanPerson", backref=db.backref("tasks", lazy="dynamic"))
    discipline = db.relationship("SluplanDiscipline", backref=db.backref("tasks", lazy="dynamic"))
    project = db.relationship("SluplanProject", backref=db.backref("tasks", cascade="all, delete-orphan"))


class SluplanComment(db.Model):
    __tablename__ = "sluplan_comments"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("sluplan_tasks.id"), nullable=False)
    author = db.Column(db.String(128))
    text = db.Column(db.Text, nullable=False)
    mentions = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    task = db.relationship("SluplanTask", backref=db.backref("comments", cascade="all, delete-orphan", order_by="SluplanComment.created_at"))


class SluplanFile(db.Model):
    __tablename__ = "sluplan_files"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("sluplan_tasks.id"), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    size = db.Column(db.Integer, nullable=False, default=0)
    content_type = db.Column(db.String(128))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    task = db.relationship("SluplanTask", backref=db.backref("files", cascade="all, delete-orphan", order_by="SluplanFile.uploaded_at"))


class SluplanDependency(db.Model):
    __tablename__ = "sluplan_dependencies"

    id = db.Column(db.Integer, primary_key=True)
    from_task_id = db.Column(db.Integer, db.ForeignKey("sluplan_tasks.id"), nullable=False)
    to_task_id = db.Column(db.Integer, db.ForeignKey("sluplan_tasks.id"), nullable=False)
    type = db.Column(db.String(8), nullable=False, default="FS")

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    from_task = db.relationship(
        "SluplanTask",
        foreign_keys=[from_task_id],
        backref=db.backref("dependencies_from", cascade="all, delete-orphan"),
    )
    to_task = db.relationship(
        "SluplanTask",
        foreign_keys=[to_task_id],
        backref=db.backref("dependencies_to", cascade="all, delete-orphan"),
    )
