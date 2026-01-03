import math
import time
from typing import Dict

from flask import Blueprint, current_app, jsonify, render_template, request
from flask_login import current_user, login_required

from app.services.gk_spill_service import list_highscores, submit_highscore

gk_spill_bp = Blueprint("gk_spill_bp", __name__, url_prefix="/spill")

HIGHSCORE_RATE_LIMIT_SECONDS = 10
_highscore_rate_state: Dict[str, float] = {}


def _rate_limit_key() -> str:
    if current_user.is_authenticated:
        return f"user:{current_user.get_id()}"
    return f"ip:{request.remote_addr or 'ukjent'}"


def _rate_limit_check(key: str) -> float:
    now = time.monotonic()
    expiry = _highscore_rate_state.get(key)
    if expiry is None:
        return 0.0
    if expiry <= now:
        _highscore_rate_state.pop(key, None)
        return 0.0
    return expiry - now


def _rate_limit_mark(key: str) -> None:
    _highscore_rate_state[key] = time.monotonic() + HIGHSCORE_RATE_LIMIT_SECONDS


def _reset_highscore_rate_limit() -> None:
    _highscore_rate_state.clear()


@gk_spill_bp.route("/", methods=["GET"])
@gk_spill_bp.route("", methods=["GET"])
@login_required
def spill_hjem():
    """Vis hovedsiden for GK-Spillet."""
    return render_template("gk_spill.html")


@gk_spill_bp.route("/api/health", methods=["GET"])
@login_required
def spill_health():
    """Enkel helsesjekk for GK-Spillet-endepunkter."""
    return jsonify({"ok": True, "app": "GK-Spillet"})


@gk_spill_bp.route("/api/highscores", methods=["GET"])
@login_required
def spill_highscores_list():
    """Returner topp-5 listen for GK-Spillet."""
    highscores = list_highscores()
    return jsonify({"highscores": highscores})


@gk_spill_bp.route("/api/highscores", methods=["POST"])
@login_required
def spill_highscore_submit():
    """Lagre en ny highscore dersom den kvalifiserer."""
    key = _rate_limit_key()
    wait_seconds = _rate_limit_check(key)
    if wait_seconds > 0:
        retry_after = max(1, math.ceil(wait_seconds))
        response = jsonify({
            "error": "for_mange_foresporsler",
            "retry_after": retry_after,
        })
        response.status_code = 429
        response.headers["Retry-After"] = str(retry_after)
        return response

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    score = payload.get("score")
    try:
        result = submit_highscore(name, score)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    _rate_limit_mark(key)
    current_app.logger.info(
        "GK-Spillet highscore: name=%s score=%s inserted=%s user=%s ip=%s",
        name,
        payload.get("score"),
        result.get("inserted"),
        getattr(current_user, "id", None),
        request.remote_addr,
    )

    status_code = 201 if result.get("inserted") else 200
    return jsonify(result), status_code
