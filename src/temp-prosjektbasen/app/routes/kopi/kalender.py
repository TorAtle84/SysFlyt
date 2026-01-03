# app/routes/kalender.py
from flask_login import login_required, current_user
from flask import Blueprint, render_template, session, redirect, url_for, jsonify, request
from app.models.task import Task
from app.models.user import User
from sqlalchemy import distinct
from datetime import datetime, timedelta
from app.utils import generer_farge_for_tekniker
from app.utils import LOKASJONER, FAG
from app.models.db import db 

kalender_bp = Blueprint('kalender', __name__)

@kalender_bp.route('/kalender')
@login_required
def kalender():
    selected_lokasjon = request.args.get('lokasjon') or current_user.location
    selected_fag = request.args.get('fag') or ''

    lokasjoner = LOKASJONER
    fag = FAG

    teknikere = User.query.filter_by(role="tekniker", approved=True).all()
    teknikere_data = [
        {
            "id": t.id,
            "email": t.email,
            "first_name": t.first_name,
            "last_name": t.last_name,
            "employee_id": t.employee_id,
            "color": t.color or "#999"
        }
        for t in teknikere
    ]

    statusverdier = ["aktiv", "utført", "kansellert"]

    return render_template(
        'kalender.html',
        selected_lokasjon=selected_lokasjon,
        selected_fag=selected_fag,
        teknikere=teknikere_data,
        statusverdier=statusverdier,
        lokasjoner=lokasjoner,
        fag=fag
    )


@kalender_bp.route('/kalender/data')
@login_required
def kalender_data():
    role = session.get('role')
    username = session.get('username')
    location = request.args.get('lokasjon') or session.get('location')
    fag = request.args.get('fag')

    query = Task.query
    if role == 'admin':
        # Admin sees all tasks, filtered by optional location/fag
        pass
    elif role == 'tekniker':
        query = query.filter_by(technician=username)
    else: # Default behavior for other roles, assume it's location-based
        query = query.filter_by(location=session.get('location'))

    if location:
        query = query.filter_by(location=location)
    if fag:
        query = query.filter_by(fag=fag)

    tasks = query.all()

    events = []
    for task in tasks:
        # Determine if the event is 'allDay' for FullCalendar based on whether both start and end times exist.
        is_all_day = (task.start_time is None and task.end_time is None)

        start_dt = datetime.combine(task.start_date, task.start_time or datetime.min.time())
        # FullCalendar's 'end' is exclusive.
        # For an allDay event ending on X, FC expects 'end' to be X + 1 day.
        # For a timed event, 'end' is inclusive.
        end_dt = datetime.combine(task.end_date, task.end_time or datetime.max.time())
        if is_all_day:
            end_dt += timedelta(days=1) # Add a day for all-day events for FullCalendar's exclusive 'end'

        farge = "#bbbbbb"  # fallback-farge
        tekniker_fornavn = "" # Tom streng som standard

        if task.technician:
            tekniker = User.query.filter_by(email=task.technician).first()
            if tekniker:
                farge = tekniker.color if tekniker and tekniker.color else "#999"
                tekniker_fornavn = tekniker.first_name # Hent fornavnet
        
        events.append({
            "id": task.id,
            "title": task.title, # ENDRING: Viser kun oppgavetittel
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "allDay": is_all_day,
            "color": farge,
            "extendedProps": {
                "status": task.status,
                "order_number": task.order_number,
                "fag": task.fag,
                "location": task.location,
                "plassering": task.plassering,
                "kommentar": task.kommentar,
                "tekniker": task.technician,
                "tekniker_fornavn": tekniker_fornavn # NYTT: Sender med fornavn for tooltip
            }
        })

    return jsonify(events)