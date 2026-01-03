from flask import Blueprint, render_template, session, redirect, url_for
from app.models.task import Task

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/')
def dashboard():
    if not session.get('user_id'):
        return redirect(url_for('auth.login'))

    role = session.get('role')
    location = session.get('location')
    username = session.get('username')  # evt. senere, for tekniker-navn

    # Rollebasert filtrering
    if role == 'admin':
        tasks = Task.query.all()
    elif role == 'tekniker':
        tasks = Task.query.filter_by(technician=username).all()  # vi bruker evt. employee_id senere
    else:
        tasks = Task.query.filter_by(location=location).all()

    return render_template('dashboard.html', tasks=tasks, role=role, location=location)
