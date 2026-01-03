from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from app.models.user import User
from app.models.db import db

brukere_bp = Blueprint('brukere', __name__)

@brukere_bp.route('/brukere', methods=['GET', 'POST'])
def brukeroversikt():
    if session.get('role') != 'admin':
        flash('Du har ikke tilgang til denne siden.', 'danger')
        return redirect(url_for('dashboard.dashboard'))

    if request.method == 'POST':
        email = request.form.get('email')
        employee_id = request.form.get('employee_id')
        password = request.form.get('password')
        role = request.form.get('role')
        location = request.form.get('location')
        is_admin_delegate = bool(request.form.get('is_admin_delegate'))

        existing = User.query.filter(
            (User.email == email) | (User.employee_id == employee_id)
        ).first()
        if existing:
            flash('Bruker med samme e-post eller ansattnummer finnes allerede.', 'danger')
            return redirect(url_for('brukere.brukeroversikt'))

        bruker = User(
            email=email,
            employee_id=employee_id,
            role=role,
            location=location,
            is_admin_delegate=is_admin_delegate
        )
        bruker.set_password(password)
        db.session.add(bruker)
        db.session.commit()
        flash('Ny bruker opprettet.', 'success')
        return redirect(url_for('brukere.brukeroversikt'))

    brukere = User.query.order_by(User.role, User.email).all()
    return render_template('brukeradministrasjon.html', brukere=brukere)
