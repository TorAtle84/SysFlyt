from flask import Blueprint, render_template, request, redirect, url_for, send_file
from flask_login import login_required
from app.models.task import Task
from app.models.db import db
from app.models.user import User
from datetime import datetime
import io
import pandas as pd

produksjon_bp = Blueprint('produksjon', __name__)

@produksjon_bp.route('/produksjonsoversikt', methods=['GET'])
@login_required
def produksjonsoversikt():
    # 1) Hent år fra query-string, ellers dagens år
    valgt_år = request.args.get('year', type=int) or datetime.today().year

    # 2) Lag en liste med år fra 2023 til inneværende år
    nåværende_år = datetime.today().year
    årsliste     = list(range(2023, nåværende_år + 1))

    # 3) Hent filter-parametre (eller None hvis ikke valgt)
    status    = request.args.get('status',     default=None)
    tekniker  = request.args.get('technician', default=None)
    lokasjon  = request.args.get('location',   default=None)

    # 4) Bygg grunnspørring på Task for valgt år
    q = Task.query.filter(
        Task.start_date.between(f"{valgt_år}-01-01", f"{valgt_år}-12-31")
    )
    if status:
        q = q.filter_by(status=status)
    if tekniker:
        q = q.filter_by(technician=tekniker)
    if lokasjon:
        q = q.filter_by(location=lokasjon)

    tasks = q.all()

    # 5) Regn ut total og utførte
    total = len(tasks)
    done  = sum(1 for t in tasks if t.status == 'utført')

    # 6) Bygg lister til dropdown-menyene
    teknikere  = sorted({t.technician for t in Task.query.distinct(Task.technician)})
    lokasjoner  = sorted({t.location   for t in Task.query.distinct(Task.location)})

    users = User.query.with_entities(User.email, User.color).all()
    color_map = {email: color or "#ffffff" for email, color in users}
    
    return render_template(
        'produksjonsoversikt.html',
        year=valgt_år,
        years=årsliste,
        total=total,
        done=done,
        selected_status=status,
        selected_technician=tekniker,
        selected_location=lokasjon,
        teknikere=teknikere,
        locations=lokasjoner,
        tasks=tasks,
        color_map=color_map
    )

@produksjon_bp.route('/produksjonsoversikt/export', methods=['GET'])
@login_required
def export():
    year = request.args.get('year', type=int, default=2025)
    # Bygg opp en DataFrame og send som Excel
    df = pd.DataFrame([{
        'Ordrenr': t.order_number,
        'Tittel':  t.title,
        'Fag':     t.fag,
        'Start':   t.start_date,
        'Slutt':   t.end_date or "",
        'Status':  t.status,
        'Tekniker':t.technician,
        'Lokasjon':t.location
    } for t in Task.query.filter(Task.start_date.startswith(f"{year}-")).all()])

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Oversikt')
    output.seek(0)

    return send_file(
      output,
      download_name=f"produksjonsoversikt_{year}.xlsx",
      as_attachment=True,
      mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@produksjon_bp.route('/produksjonsoversikt/endre_status/<int:id>', methods=['POST'])
@login_required
def endre_status(id):
    ny_status = request.form.get('status')
    t = Task.query.get_or_404(id)
    t.status = ny_status
    db.session.commit()
    # Behold year-param så vi lander på samme side
    year = request.args.get('year', default=t.start_date.year)
    return redirect(url_for('produksjon.produksjonsoversikt', year=year))

@produksjon_bp.route('/produksjonsoversikt/slett/<int:id>', methods=['POST'])
@login_required
def slett_oppgave(id):
    t = Task.query.get_or_404(id)
    db.session.delete(t)
    db.session.commit()
    year = request.args.get('year', default=t.start_date.year)
    return redirect(url_for('produksjon.produksjonsoversikt', year=year))
