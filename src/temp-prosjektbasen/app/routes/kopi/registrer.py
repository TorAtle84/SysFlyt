from flask import Blueprint, render_template, request, redirect, url_for, flash
from app.models.user import User
from app.models.db import db
from werkzeug.security import generate_password_hash

registrer_bp = Blueprint("registrer", __name__)

@registrer_bp.route("/registrer", methods=["GET", "POST"])
def registrer():
    if request.method == "POST":
        email = request.form.get("email")
        employee_id = request.form.get("employee_id")
        password = request.form.get("password")
        confirm_password = request.form.get("confirm_password")
        role = request.form.get("role").lower()
        first_name = request.form.get("first_name")
        last_name = request.form.get("last_name")
        fag = request.form.get("fag")
        location = request.form.get("location")

        # Sjekk for gyldig input
        if not all([email, employee_id, password, confirm_password, role, location]):
            flash("Alle obligatoriske felt må fylles ut.", "danger")
            return redirect(url_for("registrer.registrer"))

        if password != confirm_password:
            flash("Passordene stemmer ikke overens.", "danger")
            return redirect(url_for("registrer.registrer"))

        # Sjekk om bruker allerede finnes
        if User.query.filter_by(email=email).first():
            flash("E-post er allerede i bruk.", "danger")
            return redirect(url_for("registrer.registrer"))

        # Opprett ny bruker (standard: ikke godkjent)
        ny_bruker = User(
            email=email,
            employee_id=employee_id,
            password_hash=generate_password_hash(password),
            role=role,
            first_name=first_name,
            last_name=last_name,
            fag=fag,
            location=location,
            approved=False,
            is_admin_delegate=False
        )
        db.session.add(ny_bruker)
        db.session.commit()

        flash("Bruker registrert. En administrator må godkjenne deg før du kan logge inn.", "success")
        return redirect(url_for("auth.login"))

    # Roller og lokasjoner til bruk i skjema
    roller = ["admin", "tekniker", "prosjektleder", "prosjekteier"]
    fager = ["elektro", "ventilasjon", "byggautomasjon", "rør", "kulde", "service", "teknisk"]
    lokasjoner = [
        "Bergen", "Oslo", "Trondheim",
        "Region Vest (øvrig)", "Region Nord (øvrig)",
        "Region Sør (øvrig)", "Region Øst (øvrig)"
    ]

    return render_template("registrer_bruker.html", roller=roller, fager=fager, lokasjoner=lokasjoner)
