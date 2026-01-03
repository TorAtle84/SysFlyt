from flask_login import UserMixin
from app.models.db import db
from werkzeug.security import generate_password_hash, check_password_hash


class User(db.Model, UserMixin):
    __tablename__ = 'user'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    employee_id = db.Column(db.String(20), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    color = db.Column(db.String(20), default="#cccccc")

    first_name = db.Column(db.String(50))
    last_name = db.Column(db.String(50))
    fag = db.Column(db.String(50))
    role = db.Column(db.String(50))
    location = db.Column(db.String(50))
    is_admin_delegate = db.Column(db.Boolean, default=False)
    approved = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
        
    @property
    def is_admin(self):
        return self.is_admin_delegate
        
    def full_name(self):
        return f"{self.first_name} {self.last_name}"