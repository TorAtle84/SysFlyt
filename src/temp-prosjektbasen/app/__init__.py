import os
import sys
import json
import logging
import sqlite3
from datetime import timedelta

from flask import send_from_directory
from flask import Flask, current_app
from flask_login import LoginManager
from flask_mail import Mail
from flask_migrate import Migrate
from celery import Celery

# Importer Celery-instansen fra den nye filen
from app.celery_instance import celery

# Endret import for db: Importér modulen, ikke objektet direkte
import app.models.db as db_module # <--- VIKTIG ENDRING HER

# Flask extensions
login_manager = LoginManager()
mail = Mail()

# === MAIN APP ===
def create_app():
    app = Flask(__name__)
    # Laster all konfigurasjon fra config.py, inkludert Celery-innstillinger
    app.config.from_object('config.Config')
    app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024
    print("🔍 MAX_CONTENT_LENGTH = ", app.config.get("MAX_CONTENT_LENGTH"))

    basedir = os.path.abspath(os.path.dirname(__file__))

    # Opplastingsmappe
    upload_folder = os.path.join(basedir, '..', 'static', 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder

    # Logging til konsoll
    app.logger.setLevel(logging.DEBUG)
    if not app.logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        app.logger.addHandler(handler)

    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=1)

    # Init extensions
    # Legg til denne diagnostiske print-setningen
    try:
        # Nå refererer vi til db-objektet via modulen
        print(f"DEBUG: Type of 'db' before init_app: {type(db_module.db)}")
    except NameError:
        print("DEBUG: 'db_module.db' is not defined before init_app. This indicates an import issue.")
        raise # Re-raise the original NameError

    # Kall init_app på db-objektet fra modulen
    db_module.db.init_app(app) # <--- VIKTIG ENDRING HER
    migrate = Migrate(app, db_module.db) # <--- VIKTIG ENDRING HER

    if app.config.get('MAIL_SERVER'):
        mail.init_app(app)
    else:
        app.logger.warning("⚠️ Flask-Mail ikke aktivert: MAIL_SERVER mangler i config.")

    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'

    @login_manager.user_loader
    def load_user(user_id):
        from app.models.user import User
        return User.query.get(int(user_id))

    # Registrer modeller og blåkopier
    with app.app_context():
        # Her må du også importere db_module.db hvis du bruker det direkte
        # f.eks. db_module.db.create_all()
        from app.models import (
            user,
            task,
            task_revision,
            attachment,
            fag,
            gruppe,
            underpunkt,
            project,
            merkeskilt,
            gk_spill,
        )
        db_module.db.create_all() # <--- VIKTIG ENDRING HER
        app.logger.info("✅ Modeller lastet og tabeller sjekket")

    from app.routes import register_blueprints
    register_blueprints(app)

    app.logger.info("✅ Flask-app klar")
    return app, celery # Returner den importerte celery-instansen

# Brukes av CLI-scripts e.l.
def create_app_only():
    app, _ = create_app()
    return app

# SQLite connection fallback
def get_db_connection():
    db_uri = current_app.config['SQLALCHEMY_DATABASE_URI'].replace('sqlite:///', '')
    conn = sqlite3.connect(db_uri)
    conn.row_factory = sqlite3.Row
    return conn

def make_celery(app):
    celery = Celery(
        app.import_name,
        broker=app.config["CELERY_BROKER_URL"],
        backend=app.config["CELERY_RESULT_BACKEND"],
        include=["app.tasks.training_tasks"],
    )
    celery.conf.update(
        task_always_eager=app.config.get("CELERY_TASK_ALWAYS_EAGER", False),
        task_eager_propagates=app.config.get("CELERY_TASK_EAGER_PROPAGATES", True),
    )
    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)
    celery.Task = ContextTask
    return celery
