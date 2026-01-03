from app.routes.auth import auth_bp
from app.routes.dashboard import dashboard_bp

# === MODULER ===
from app.routes.produksjon import produksjon_bp
from app.routes.oppgaver import oppgaver_bp, oppgave_api
from app.routes.brukere import brukere_bp
from app.routes.registrer import registrer_bp
from app.routes.kalender import kalender_bp
from app.routes.admin_routes import admin_bp
from app.routes.timecalculator import timecalculator_bp
from app.routes.merkeskilt import merkeskilt_bp
from app.routes.kravsporing import kravsporing_bp
from app.routes.dokumentsammenligning import dokumentsammenligning_bp
from app.routes.systemkomponent import systemkomponent_bp
from app.routes.project_base import project_bp
from app.routes.protokoller import bp as protokoller_bp
from app.routes.masseliste import masseliste_bp

def register_blueprints(app):
    """
    Binder alle blueprints til Flask app.
    """
    # === Grunnleggende ===
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)

    # === Funksjonelle moduler ===
    app.register_blueprint(produksjon_bp)
    app.register_blueprint(oppgaver_bp)
    app.register_blueprint(brukere_bp)
    app.register_blueprint(registrer_bp)
    app.register_blueprint(kalender_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(timecalculator_bp)
    app.register_blueprint(merkeskilt_bp)
    app.register_blueprint(kravsporing_bp)
    app.register_blueprint(dokumentsammenligning_bp)
    app.register_blueprint(systemkomponent_bp)
    app.register_blueprint(protokoller_bp)
    app.register_blueprint(project_bp)  
    app.register_blueprint(masseliste_bp)


    # === API spesifikke ===
    app.register_blueprint(oppgave_api, url_prefix="/api")

    # === Bekreft i logg ===
    app.logger.info("[register_blueprints] ✔️ Alle blueprints er registrert!")
