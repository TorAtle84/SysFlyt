import os
from flask import Blueprint, render_template, request, current_app, jsonify, send_file, redirect
from flask_login import login_required, current_user
import openpyxl
import json
from io import BytesIO
from app.models.db import db
from app.models.fag import Fag
from app.models.gruppe import Gruppe
from app.models.underpunkt import Underpunkt
from app.models.project import Project

timecalculator_bp = Blueprint('timecalculator', __name__, url_prefix='/timecalculator')


@timecalculator_bp.route("/", methods=["GET"])
@login_required
def tidskalkulator():
    fager = Fag.query.order_by(Fag.name).all()
    selected_fag = request.args.get("fag")
    if not selected_fag and fager:
        selected_fag = fager[0].name

    grupper = Gruppe.query.filter_by(fag=selected_fag).order_by(Gruppe.order).all()
    projects = Project.query.order_by(Project.project_name).all()  # 👈 flyttet hit

    return render_template(
        "tidskalkulator.html",
        fager=fager,
        selected_fag=selected_fag,
        grupper=grupper,
        projects=projects
    )


@timecalculator_bp.route("/save-template", methods=["POST"])
@login_required
def save_template():
    if not current_user.is_admin:
        return jsonify({'error': 'Ikke autorisert'}), 403

    data = request.get_json()
    fag = data.get("fag")
    grupper = data.get("grupper")

    if not fag or not grupper:
        return jsonify({"error": "Ugyldig data"}), 400

    # 🔑 RIKTIG SLETTING: Bruk session.delete + cascade!
    eksisterende = Gruppe.query.filter_by(fag=fag).all()
    for g in eksisterende:
        db.session.delete(g)

    # 🚀 Legg inn nye grupper + underpunkter
    for g_index, g in enumerate(grupper):
        gruppe = Gruppe(name=g["name"], fag=fag, order=g["order"])
        db.session.add(gruppe)
        db.session.flush()  # sikre gruppe.id

        for u in g["underpunkter"]:
            underpunkt = Underpunkt(
                gruppe_id=gruppe.id,
                name=u["name"],
                order=u["order"],
                default_count=u["default_count"],
                default_time=u["default_time"]
            )
            db.session.add(underpunkt)

    db.session.commit()
    return jsonify({"message": "Malen er lagret."}), 200


@timecalculator_bp.route('/export', methods=['POST'])
@login_required
def export_excel():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Ingen data mottatt'}), 400

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = data.get('fag', 'Kalkulator')

    row = 1
    for gruppe in data.get('grupper', []):
        ws.cell(row, 1, gruppe['name'])
        row += 1
        ws.append(['Underpunkt', 'Antall', 'Tid pr. stk', 'Total tid'])
        row += 1
        for item in gruppe['underpunkter']:
            ws.append([
                item['name'],
                item['default_count'],
                item['default_time'],
                item['default_count'] * item['default_time']
            ])
            row += 1
        row += 1  # Tom rad mellom grupper

    # Risiko og summering
    ws.append(['Total før risiko', data.get('total_before', '')])
    ws.append(['Ekstra risiko', data.get('risk_extra', '')])
    ws.append(['Total etter risiko', data.get('total_after', '')])
    ws.append(['Rundet opp', data.get('rounded', '')])

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return send_file(
        output,
        download_name=f"{data.get('fag', 'Kalkulator')}.xlsx",
        as_attachment=True,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@timecalculator_bp.route("/send_tidsbruk", methods=["POST"])
@login_required
def send_tidsbruk():
    data = request.get_json()
    project_id = data.get("project_id")
    grupper = data.get("grupper", [])
    total_before = data.get("total_before", 0)
    risk_extra = data.get("risk_extra", 0)
    total_after = data.get("total_after", 0)
    rounded = data.get("rounded", 0)

    if not project_id or not grupper:
        return jsonify({"error": "Mangler prosjekt eller grupper"}), 400

    project = Project.query.get(project_id)
    if not project:
        return jsonify({"error": "Fant ikke prosjekt"}), 404

    project.time_usage = {
        "grupper": grupper,
        "total_before": total_before,
        "risk_extra": risk_extra,
        "total_after": total_after,
        "rounded": rounded
    }

    db.session.commit()
    return jsonify({"success": True})