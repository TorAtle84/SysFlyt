import os
import zipfile
import shutil
from datetime import datetime
from flask import Blueprint, send_file, request, redirect, url_for, flash, render_template, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app.models.user import User
from app.models.db import db
from app.models.project import Project

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/admin/brukere', methods=['GET'])
@login_required
def brukeradministrasjon():
    if current_user.role != 'admin':
        return "Access denied", 403

    brukere = User.query.all()
    roller = ["tekniker", "prosjektleder", "prosjekteier", "admin"]
    fager = ["elektro", "ventilasjon", "byggautomasjon", "rør", "kulde", "service", "teknisk"]
    lokasjoner = [
        "Bergen", "Oslo", "Trondheim",
        "Region Vest (øvrig)", "Region Nord (øvrig)",
        "Region Sør (øvrig)", "Region Øst (øvrig)"
    ]
    
    prosjekter = Project.query.order_by(Project.project_name).all()

    return render_template("brukeradministrasjon.html", brukere=brukere, prosjekter=prosjekter, roller=roller, fager=fager, lokasjoner=lokasjoner)

@admin_bp.route('/admin/brukere/<int:bruker_id>/endre', methods=['POST'])
@login_required
def oppdater_bruker(bruker_id):
    if current_user.role != 'admin':
        return "Access denied", 403

    bruker = User.query.get_or_404(bruker_id)

    # Ikke tillat admin å deaktivere seg selv
    if current_user.id == bruker.id:
        approved = bruker.approved  # behold godkjenning
    else:
        approved = request.form.get('approved') == '1'

    bruker.email = request.form.get('email')
    bruker.employee_id = request.form.get('employee_id')
    bruker.first_name = request.form.get('first_name')
    bruker.last_name = request.form.get('last_name')
    bruker.role = request.form.get('role')
    bruker.color = request.form.get("color")
    bruker.fag = request.form.get('fag')
    bruker.location = request.form.get('location')
    bruker.is_admin_delegate = request.form.get('is_admin_delegate') == '1'
    bruker.approved = approved

    db.session.commit()
    flash("Bruker oppdatert", "success")
    return redirect(url_for('admin.brukeradministrasjon'))

@admin_bp.route('/admin/brukere/<int:bruker_id>/slett', methods=['POST'])
@login_required
def slett_bruker(bruker_id):
    if current_user.role != 'admin':
        return "Access denied", 403

    if current_user.id == bruker_id:
        flash("Du kan ikke slette deg selv.", "danger")
        return redirect(url_for('admin.brukeradministrasjon'))

    bruker = User.query.get_or_404(bruker_id)
    db.session.delete(bruker)
    db.session.commit()
    flash("Bruker slettet", "success")
    return redirect(url_for('admin.brukeradministrasjon'))

@admin_bp.route('/admin/last_ned_backup', methods=['POST'])
@login_required
def last_ned_backup():
    if current_user.role != 'admin':
        return "Access denied", 403

    # Bruk faktisk konfigurasjon
    db_uri = current_app.config['SQLALCHEMY_DATABASE_URI'].replace("sqlite:///", "")
    db_path = os.path.abspath(db_uri)

    backup_dir = os.path.dirname(db_path)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    zip_filename = f"backup_{timestamp}.zip"
    zip_path = os.path.join(backup_dir, zip_filename)

    with zipfile.ZipFile(zip_path, 'w') as zipf:
        zipf.write(db_path, arcname='prosjektbase.db')

    flash(f"Backup fullført: {zip_filename}", "success")
    return send_file(zip_path, as_attachment=True)


@admin_bp.route('/admin/last_opp_backup', methods=['POST'])
@login_required
def last_opp_backup():
    if current_user.role != 'admin':
        return "Access denied", 403

    file = request.files.get('backup_file')
    if not file or not file.filename.endswith('.db'):
        flash("Ugyldig fil. Last opp en gyldig .db-backup.", "danger")
        return redirect(url_for('admin.brukeradministrasjon'))

    db_uri = current_app.config['SQLALCHEMY_DATABASE_URI'].replace("sqlite:///", "")
    db_path = os.path.abspath(db_uri)

    upload_path = os.path.join(os.path.dirname(db_path), 'uploaded_backup.db')
    file.save(upload_path)

    try:
        shutil.copyfile(upload_path, db_path)
        flash("Backup gjenopprettet. Start applikasjonen på nytt for å bruke ny database.", "success")
    except PermissionError:
        flash("Feil: Har ikke tilgang til å overskrive databasen. Lukk applikasjonen og prøv igjen.", "danger")

    return redirect(url_for('admin.brukeradministrasjon'))

    
@admin_bp.route('/admin/prosjekter/<int:prosjekt_id>/oppdater', methods=['POST'])
@login_required
def oppdater_prosjekt(prosjekt_id):
    if current_user.role != 'admin':
        return "Access denied", 403

    prosjekt = Project.query.get_or_404(prosjekt_id)
    prosjekt.project_name = request.form.get('project_name').strip()

    # Slå opp prosjektleder etter navn
    leader_name = request.form.get("project_leader_id", "").strip()
    leader = User.query.filter(
        db.func.lower(User.first_name + " " + User.last_name) == leader_name.lower()
    ).first()

    # Slå opp prosjekteier etter navn (valgfritt)
    manager_name = request.form.get("project_manager_id", "").strip()
    manager = None
    if manager_name:
        manager = User.query.filter(
            db.func.lower(User.first_name + " " + User.last_name) == manager_name.lower()
        ).first()

    prosjekt.project_leader_id = leader.id if leader else None
    prosjekt.project_manager_id = manager.id if manager else None

    db.session.commit()
    flash("Prosjekt oppdatert", "success")
    return redirect(url_for('admin.brukeradministrasjon'))
    
@admin_bp.route('/admin/prosjekter/<int:prosjekt_id>/slett', methods=['POST'])
@login_required
def slett_prosjekt(prosjekt_id):
    if current_user.role != 'admin':
        return "Access denied", 403

    prosjekt = Project.query.get_or_404(prosjekt_id)
    db.session.delete(prosjekt)
    db.session.commit()
    flash("Prosjektet ble slettet", "success")
    return redirect(url_for('admin.brukeradministrasjon'))

