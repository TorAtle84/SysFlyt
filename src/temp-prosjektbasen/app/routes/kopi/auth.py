from flask import Blueprint, render_template, request, redirect, url_for, flash, session
from flask_login import login_user, logout_user, LoginManager
from app.models.user import User
from app.models.db import db

auth_bp = Blueprint("auth", __name__)
login_manager = LoginManager()

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        bruker = User.query.filter_by(email=email).first()

        if not bruker:
            flash("Bruker ikke funnet.", "danger")
            return redirect(url_for("auth.login"))

        if not bruker.approved:
            flash("Brukeren er ikke aktivert av administrator.", "warning")
            return redirect(url_for("auth.login"))

        if not bruker.check_password(password):
            flash("Feil passord.", "danger")
            return redirect(url_for("auth.login"))

        login_user(bruker)
        session.permanent = True
        session['user_id'] = bruker.id
        session['location']   = bruker.location
        session['role']       = bruker.role
        session['username']   = f"{bruker.first_name} {bruker.last_name}"
        flash("Innlogging vellykket.", "success")
        return redirect(url_for("dashboard.dashboard"))

    return render_template("login.html")


@auth_bp.route("/logout")
def logout():
    logout_user()
    flash("Du er nå logget ut.", "info")
    return redirect(url_for("auth.login"))
