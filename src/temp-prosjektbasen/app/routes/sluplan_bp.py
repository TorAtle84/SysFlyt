from collections import Counter
from datetime import datetime, timezone
from typing import Dict, Iterable, Optional

from flask import Blueprint, jsonify, render_template, request, Response
from flask_login import login_required

from app.services.sluplan_service import (
    add_comment_to_task,
    add_file_attachment,
    create_project,
    create_task,
    export_plan,
    generate_task_ics,
    get_alerts,
    get_plan_snapshot,
    get_project_snapshot,
    get_tasks,
    import_plan,
    import_systems_from_excel,
    list_base_projects,
    list_projects,
    list_resource_catalog,
    reset_plan,
    summarize_by_discipline,
    summarize_by_time_window,
    summarize_by_user,
    update_task_fields,
)

sluplan_bp = Blueprint("sluplan_bp", __name__, url_prefix="/sluplan")


def _flatten(tasks: Iterable[Dict]) -> Iterable[Dict]:
    for task in tasks:
        yield task
        children = task.get("children") or []
        yield from _flatten(children)


def _parse_project_id(value: object) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _project_id_from_args() -> Optional[int]:
    return _parse_project_id(request.args.get("project_id"))


@sluplan_bp.route("/", methods=["GET"])
@sluplan_bp.route("", methods=["GET"])
@login_required
def sluplan_home():
    """Vis hovedsiden for SluPlan."""
    return render_template("sluplan.html")


@sluplan_bp.route("/api/health", methods=["GET"])
@login_required
def sluplan_health():
    """Enkel helsesjekk for SluPlan-endepunkter."""
    return jsonify({"ok": True, "app": "SluPlan"})


@sluplan_bp.route("/api/projects", methods=["GET"])
@login_required
def sluplan_projects_list():
    """List alle SluPlan-prosjekter."""
    search = request.args.get("search")
    projects = list_projects(search)
    if not projects and not (search or "").strip():
        snapshot = get_project_snapshot(None)
        projects = [snapshot]
    return jsonify({"projects": projects})


@sluplan_bp.route("/api/projects/base", methods=["GET"])
@login_required
def sluplan_projects_base():
    """Tilby liste over prosjekter fra Prosjektbasen som kan kobles."""
    search = request.args.get("search")
    options = list_base_projects(search)
    return jsonify({"projects": options})


@sluplan_bp.route("/api/projects", methods=["POST"])
@login_required
def sluplan_projects_create():
    payload = request.get_json(silent=True) or {}
    try:
        project = create_project(payload)
        plan = get_plan_snapshot(project["id"])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(plan), 201


@sluplan_bp.route("/api/projects/<int:project_id>", methods=["GET"])
@login_required
def sluplan_project_detail(project_id: int):
    try:
        snapshot = get_project_snapshot(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    return jsonify(snapshot)


@sluplan_bp.route("/api/resources", methods=["GET"])
@login_required
def sluplan_resource_catalog():
    """Tilby oversikt over personer og fag fra Prosjektbasen."""
    catalog = list_resource_catalog()
    return jsonify(catalog)


@sluplan_bp.route("/api/tasks", methods=["GET"])
@login_required
def sluplan_tasks_list():
    """Returner dagens plan."""
    project_id = _project_id_from_args()
    try:
        plan = get_plan_snapshot(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    return jsonify(plan)


@sluplan_bp.route("/api/tasks/<task_id>/ics", methods=["GET"])
@login_required
def sluplan_task_ics(task_id: str):
    """Eksporter en oppgave som ICS-fil."""
    try:
        ics_content = generate_task_ics(task_id)
    except ValueError as exc:
        message = str(exc)
        status = 404 if message == "task_finnes_ikke" else 400
        return jsonify({"error": message}), status

    filename = f"sluplan_{task_id}.ics"
    response = Response(ics_content, mimetype="text/calendar")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@sluplan_bp.route("/api/tasks/<task_id>", methods=["PATCH"])
@login_required
def sluplan_task_update(task_id: str):
    """Oppdater felt på en eksisterende oppgave (ressurs, status, dato)."""
    payload = request.get_json(silent=True) or {}
    try:
        task = update_task_fields(task_id, payload)
    except ValueError as exc:
        message = str(exc)
        status = 404 if message == "task_finnes_ikke" else 400
        return jsonify({"error": message}), status
    return jsonify(task)


@sluplan_bp.route("/api/tasks", methods=["POST"])
@login_required
def sluplan_tasks_create():
    """Opprett en ad-hoc oppgave i planen."""
    payload = request.get_json(silent=True) or {}
    payload["project_id"] = _parse_project_id(payload.get("project_id")) or _project_id_from_args()
    try:
        task = create_task(payload)
    except ValueError as exc:  # type: ignore[redundant-except]
        return jsonify({"error": str(exc)}), 400
    return jsonify(task), 201


@sluplan_bp.route("/api/reports/summary", methods=["GET"])
@login_required
def sluplan_reports_summary():
    """Gi en enkel oppsummering av oppgaver per status (inkludert underoppgaver)."""
    project_id = _project_id_from_args()
    try:
        tasks = get_tasks(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    flat = list(_flatten(tasks))
    counter = Counter(task.get("status") or "ukjent" for task in flat)
    return jsonify(
        {
            "total": len(flat),
            "per_status": dict(counter),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    )


@sluplan_bp.route("/api/reports/by-discipline", methods=["GET"])
@login_required
def sluplan_reports_by_discipline():
    """Returner aggregert statistikk per fag/discipline."""
    project_id = _project_id_from_args()
    try:
        items = summarize_by_discipline(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    return jsonify({"generated_at": datetime.now(timezone.utc).isoformat(), "items": items})


@sluplan_bp.route("/api/reports/by-user", methods=["GET"])
@login_required
def sluplan_reports_by_user():
    """Returner aggregert statistikk per bruker/ressurs."""
    project_id = _project_id_from_args()
    try:
        items = summarize_by_user(project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    return jsonify({"generated_at": datetime.now(timezone.utc).isoformat(), "items": items})


@sluplan_bp.route("/api/reports/time", methods=["GET"])
@login_required
def sluplan_reports_time():
    """Returner statistikk for oppgaver innenfor et tidsintervall."""
    from_value = request.args.get("from")
    to_value = request.args.get("to")
    try:
        report = summarize_by_time_window(_project_id_from_args(), from_value, to_value)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(report)


@sluplan_bp.route("/api/plan/export", methods=["GET"])
@login_required
def sluplan_plan_export():
    """Eksporter hele SluPlan-planen som JSON."""
    try:
        plan = export_plan(_project_id_from_args())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    return jsonify(plan)


@sluplan_bp.route("/api/plan/import", methods=["POST"])
@login_required
def sluplan_plan_import():
    """Importer en komplett plan og overskriv eksisterende data."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "ugyldig_planformat"}), 400
    try:
        project_id = _parse_project_id(payload.get("project_id"))
        plan = import_plan(payload, project_id=project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(plan)


@sluplan_bp.route("/api/alerts", methods=["GET"])
@login_required
def sluplan_alerts():
    """Returner varsler for kommende oppgaver, dagens frister og forfalte."""
    try:
        alerts = get_alerts(_project_id_from_args())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    return jsonify(alerts)


@sluplan_bp.route("/api/tasks/reset", methods=["POST"])
@login_required
def sluplan_tasks_reset():
    """Tilbakestill planen til standard milepæler (kan utvides med systemliste senere)."""
    payload = request.get_json(silent=True) or {}
    project_id = _parse_project_id(payload.get("project_id")) or _project_id_from_args()
    systems = payload.get("systems")
    if systems is not None:
        if not isinstance(systems, list) or any(not isinstance(item, str) for item in systems):
            return jsonify({"error": "systems_må_være_liste"}), 400
        systems = [str(item).strip() for item in systems if str(item).strip()]
        if not systems:
            systems = None
    try:
        plan = reset_plan(project_id, systems=systems)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    return jsonify(plan)


@sluplan_bp.route("/api/import/excel", methods=["POST"])
@login_required
def sluplan_import_excel():
    """Importer systemoppgaver fra en Excel-fil."""
    if "file" not in request.files:
        return jsonify({"error": "fil_mangler"}), 400

    file_storage = request.files["file"]
    if not file_storage or file_storage.filename is None or not file_storage.filename.strip():
        return jsonify({"error": "filnavn_mangler"}), 400

    project_id = _parse_project_id(request.form.get("project_id")) or _project_id_from_args()
    try:
        plan = import_systems_from_excel(file_storage, project_id=project_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    finally:
        try:
            file_storage.close()
        except Exception:
            pass

    return jsonify(plan), 200


@sluplan_bp.route("/api/tasks/<task_id>/comment", methods=["POST"])
@login_required
def sluplan_task_add_comment(task_id: str):
    """Legg til kommentar på valgt oppgave."""
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    author = (payload.get("author") or "").strip() or None
    if not text:
        return jsonify({"error": "kommentar_tom"}), 400
    try:
        task = add_comment_to_task(task_id, text, author)
    except ValueError as exc:
        message = str(exc)
        status = 404 if message == "task_finnes_ikke" else 400
        return jsonify({"error": message}), status
    return jsonify(task), 201


@sluplan_bp.route("/api/tasks/<task_id>/file", methods=["POST"])
@login_required
def sluplan_task_add_file(task_id: str):
    """Last opp (metadata for) et vedlegg knyttet til oppgaven."""
    if "file" not in request.files:
        return jsonify({"error": "fil_mangler"}), 400
    file_storage = request.files["file"]
    if not file_storage or file_storage.filename is None or not file_storage.filename.strip():
        return jsonify({"error": "filnavn_mangler"}), 400
    content = file_storage.read() or b""
    try:
        task = add_file_attachment(task_id, file_storage.filename, len(content), file_storage.mimetype)
    except ValueError as exc:
        message = str(exc)
        status = 404 if message == "task_finnes_ikke" else 400
        return jsonify({"error": message}), status
    finally:
        try:
            file_storage.close()
        except Exception:
            pass
    return jsonify(task), 201
