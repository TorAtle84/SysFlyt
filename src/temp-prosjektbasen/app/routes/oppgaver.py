from flask import Blueprint, request, jsonify, render_template, redirect, url_for, flash, Response, send_file, current_app
from flask_login import login_required, current_user
from datetime import datetime, timedelta, timezone
from sqlalchemy import func
from ics import Calendar, Event
from app.models.db import db
from app.models.task import Task
from app.models.user import User
from app.models.task_revision import TaskRevision
from app.helligdager import hent_norske_helligdager
from app.utils import ensure_ics_uid, send_ics_cancel, build_ics_string 

import io
import zipfile
import os

oppgaver_bp = Blueprint('oppgaver', __name__)
oppgave_api = Blueprint('oppgave_api', __name__) # Use this specifically for API endpoints that aren't tied to a traditional page view


@oppgaver_bp.route('/ny_oppgave', methods=['GET', 'POST']) # Endret til GET, POST for å støtte AJAX POST
@login_required
def ny_oppgave():
    teknikere = User.query.filter(func.lower(User.role) == 'tekniker',
                                  User.approved == True).all()

    if request.method == 'POST': # Håndter POST for skjema-submit (hvis du ikke allerede har opprett_oppgave_api for dette)
        # Siden du har opprett_oppgave_api som POST, kan du bare returnere jsonify her
        # eller redirecte for full side reload om det er en tradisjonell form submit.
        # Men for modalen sender vi AJAX POST til /api/oppgave, så denne POST-delen her blir sjelden brukt.
        pass # La opprett_oppgave_api håndtere POST fra modalen

    # Hvis det er en AJAX-forespørsel (f.eks. fra modalen), returner kun skjemaet
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return render_template("opprett_oppgave_fragment.html", teknikere=teknikere) # <--- NY FRAGMENT FIL
    else:
        # Hvis det er en vanlig GET-forespørsel (f.eks. direkte URL), returner hele siden
        return render_template("opprett_oppgave.html", teknikere=teknikere)

@oppgaver_bp.route("/api/helligdager")
def api_helligdager():
    return jsonify(hent_norske_helligdager())

# This route (hent_oppgaver) is typically superseded by kalender.py/kalender_data
@oppgaver_bp.route('/api/oppgaver', methods=['GET'])
def hent_oppgaver():
    return jsonify([]) # Returning empty, assuming kalender.py/kalender_data is primary source


@oppgaver_bp.route('/api/oppgave', methods=['POST']) # This route is for CREATING a NEW task (from a form/API)
@login_required
def opprett_oppgave_api():
    data = request.json
    try:
        start_dt_obj = datetime.fromisoformat(data['start'])
        start_date = start_dt_obj.date()
        start_time = start_dt_obj.time() if 'T' in data['start'] else None

        end_dt_obj = datetime.fromisoformat(data['end']) if data.get('end') else None
        end_date = end_dt_obj.date() if end_dt_obj else start_date
        end_time = end_dt_obj.time() if end_dt_obj and 'T' in data['end'] else None

    except (ValueError, KeyError) as e:
        return jsonify({"error": f"Ugyldig dato/tid format for opprettelse: {e}"}), 400

    ny = Task(
        title=data.get('title'),
        start_date=start_date,
        start_time=start_time,
        end_date=end_date,
        end_time=end_time,
        technician=data.get('tekniker'),
        status=data.get('status'),
        order_number=data.get('ordrenummer'),
        location=data.get('lokasjon'),
        plassering=data.get('plassering'),
        fag=data.get('fag'),
        opprettet_av=current_user.email
    )
    db.session.add(ny)
    db.session.commit()
    return jsonify({'message': 'Oppgave opprettet', 'id': ny.id})


@oppgaver_bp.route('/api/oppgave/<int:id>', methods=['GET']) # Getting a single task
@login_required
def hent_oppgave(id):
    o = Task.query.get_or_404(id)
    
    start_datetime_str = ""
    if o.start_date:
        start_datetime_str = f"{o.start_date.isoformat()}T{o.start_time.strftime('%H:%M:%S')}" if o.start_time else o.start_date.isoformat()

    end_datetime_str = None
    if o.end_date:
        end_datetime_str = f"{o.end_date.isoformat()}T{o.end_time.strftime('%H:%M:%S')}" if o.end_time else o.end_date.isoformat()

    return jsonify({
        "id": o.id,
        "title": o.title,
        "start": start_datetime_str,
        "end": end_datetime_str,
        "tekniker": o.technician,
        "status": o.status,
        "order_number": o.order_number,
        "location": o.location,
        "plassering": o.plassering or "",
        "fag": o.fag,
        "kommentar": getattr(o, "kommentar", ""),
        "teknikerKommentar": getattr(o, "teknikerKommentar", ""),
        "opprettet_av": o.opprettet_av,
        "ics_exists": getattr(o, "ics_filename", None) is not None,
        "files": [{"filename": f.filename} for f in getattr(o, "files", [])]
    })


@oppgaver_bp.route('/api/oppgave/<int:task_id>/revisions', methods=['GET'])
@login_required
def hent_oppgave_revisjoner(task_id):
    revisions = TaskRevision.query.filter_by(task_id=task_id).order_by(TaskRevision.change_date.desc()).all()
    
    revisions_data = []
    for rev in revisions:
        revisions_data.append({
            "id": rev.id,
            "task_id": rev.task_id,
            "ics_sequence": rev.ics_sequence,
            "change_date": rev.change_date.isoformat(),
            "changed_by": rev.changed_by,
            "old_title": rev.old_title,
            "old_start_date": rev.old_start_date.isoformat() if rev.old_start_date else None,
            "old_start_time": rev.old_start_time.strftime('%H:%M:%S') if rev.old_start_time else None,
            "old_end_date": rev.old_end_date.isoformat() if rev.old_end_date else None,
            "old_end_time": rev.old_end_time.strftime('%H:%M:%S') if rev.old_end_time else None,
            "old_technician": rev.old_technician,
            "new_title": rev.new_title,
            "new_start_date": rev.new_start_date.isoformat() if rev.new_start_date else None,
            "new_start_time": rev.new_start_time.strftime('%H:%M:%S') if rev.new_start_time else None,
            "new_end_date": rev.new_end_date.isoformat() if rev.new_end_date else None,
            "new_end_time": rev.new_end_time.strftime('%H:%M:%S') if rev.new_end_time else None,
            "new_technician": rev.new_technician,
            "display_text_raw": f"Rev. {rev.ics_sequence} - Endret {rev.change_date.strftime('%d.%m.%Y %H:%M')} av {rev.changed_by}"
        })
    
    return jsonify(revisions_data)


# THIS IS THE UNIFIED PATCH ENDPOINT FOR UPDATING EXISTING TASKS (from modal, drag/drop)
@oppgaver_bp.route('/api/oppgave/<int:id>', methods=['PATCH']) # ONLY PATCH here
@login_required
def update_existing_task(id): # Renamed for clarity to avoid confusion with POST oppdater_oppgave
    current_app.logger.debug(f"PATCH request received for task {id}")
    data = request.json
    o = Task.query.get_or_404(id)

    ensure_ics_uid(o)

    # --- Store old values for revision log and comparison ---
    old_title_db = o.title
    old_start_date = o.start_date
    old_start_time = o.start_time
    old_end_date = o.end_date
    old_end_time = o.end_time
    old_technician = o.technician
    old_status = o.status
    old_location = o.location
    old_plassering = o.plassering
    old_fag = o.fag
    old_kommentar = o.kommentar
    old_tekniker_kommentar = getattr(o, "teknikerKommentar", None)

    old_start_combined = ""
    if old_start_date:
        old_start_combined = f"{old_start_date.isoformat()}T{old_start_time.strftime('%H:%M:%S')}" if old_start_time else old_start_date.isoformat()
    old_end_combined = ""
    if old_end_date:
        old_end_combined = f"{old_end_date.isoformat()}T{old_end_time.strftime('%H:%M:%S')}" if old_end_time else old_end_date.isoformat()

    # --- Get new values from request ---
    # Use .get(key, default) for fields that might not be present in PATCH payload
    new_title = data.get("title", old_title_db)
    new_location = data.get("location", old_location)
    new_plassering = data.get("plassering", old_plassering)
    new_technician = data.get("technician", old_technician)
    new_status = data.get("status", old_status)
    new_fag = data.get("fag", old_fag)
    new_kommentar = data.get("kommentar", old_kommentar)
    new_tekniker_kommentar = data.get("teknikerKommentar", old_tekniker_kommentar)
    
    new_start_combined = data.get("start")
    new_end_combined = data.get("end")

    new_start_date_obj, new_start_time_obj = None, None
    new_end_date_obj, new_end_time_obj = None, None

    # Parse date/time objects from incoming combined strings
    if new_start_combined:
        try:
            dt_object = datetime.fromisoformat(new_start_combined)
            new_start_date_obj = dt_object.date()
            new_start_time_obj = dt_object.time() if 'T' in new_start_combined else None
        except ValueError as e:
            current_app.logger.error(f"Failed to parse new_start_combined: {new_start_combined}, Error: {e}")
            return jsonify({"error": f"Ugyldig format for startdato/tid: {new_start_combined}"}), 400

    if new_end_combined:
        try:
            dt_object = datetime.fromisoformat(new_end_combined)
            new_end_date_obj = dt_object.date()
            new_end_time_obj = dt_object.time() if 'T' in new_end_combined else None
        except ValueError:
            current_app.logger.error(f"Failed to parse new_end_combined: {new_end_combined}, Error: {e}")
            return jsonify({"error": f"Ugyldig format for sluttdato/tid: {new_end_combined}"}), 400
    else: # If end is not provided, default to start date and time
        new_end_date_obj = new_start_date_obj
        new_end_time_obj = new_start_time_obj


    # KRITISK: Construct the old ICS summary using the old state before any updates
    old_ics_summary_for_cancel = f"{old_plassering} – {old_title_db}" if old_plassering else old_title_db

    # Determine if a major change requiring ICS update/cancel has occurred
    major_change_for_ics = (
        new_start_combined != old_start_combined or
        new_end_combined != old_end_combined or
        new_title != old_title_db or
        new_location != old_location or
        new_plassering != old_plassering or
        new_technician != old_technician
    )

    if major_change_for_ics:
        revision = TaskRevision(
            task_id=o.id,
            ics_sequence=o.ics_sequence, # Log the sequence *before* this change
            change_date=datetime.utcnow(),
            changed_by=current_user.email,
            old_title=old_ics_summary_for_cancel,
            old_start_date=old_start_date,
            old_start_time=old_start_time,
            old_end_date=old_end_date,
            old_end_time=old_end_time,
            old_technician=old_technician,
            new_title=new_title, # This is the new title for the revision log
            new_start_date=new_start_date_obj,
            new_start_time=new_start_time_obj,
            new_end_date=new_end_date_obj,
            new_end_time=new_end_time_obj,
            new_technician=new_technician
        )
        db.session.add(revision)

        o.ics_sequence += 1 # Increment sequence for the CANCEL event
        db.session.commit() # IMPORTANT: Commit sequence and revision here for send_ics_cancel

        send_ics_cancel(
            ics_uid=o.ics_uid,
            ics_sequence=o.ics_sequence, # This is the sequence for the cancellation
            old_title=old_ics_summary_for_cancel,
            old_start_date=old_start_date,
            old_start_time=old_start_time,
            old_end_date=old_end_date,
            old_end_time=old_end_time
        )
        current_app.logger.info(f"Sent ICS CANCEL for task {o.id} (Seq: {o.ics_sequence})")

        o.ics_sequence += 1 # Increment again for the NEW event's invitation (higher sequence)
    else:
        o.ics_sequence += 1 # Usual update, increment sequence even for minor changes
    
    # --- Update the task object with new values ---
    o.title = new_title
    o.start_date = new_start_date_obj
    o.start_time = new_start_time_obj
    o.end_date = new_end_date_obj
    o.end_time = new_end_time_obj
    o.technician = new_technician
    o.status = new_status
    o.order_number = data.get("order_number", o.order_number)
    o.location = new_location
    o.plassering = new_plassering
    o.fag = new_fag
    o.kommentar = new_kommentar
    if hasattr(o, "teknikerKommentar"): # Safely update if column exists
        o.teknikerKommentar = new_tekniker_kommentar

    db.session.commit() # Final commit for the task itself and the last sequence increment

    current_app.logger.debug(f"Task {o.id} updated to Seq: {o.ics_sequence}. New dates: {o.start_date} {o.start_time} - {o.end_date} {o.end_time}")

    return jsonify({
        'message': 'Oppgave oppdatert',
        'id': o.id, # Return ID for frontend reference
        'new_sequence': o.ics_sequence # Return new sequence
    })


# THIS IS THE ORIGINAL POST ROUTE for full task update, but it's CONFLICTING with the PATCH above.
# We are making the PATCH route the unified update endpoint.
# So, this route is likely REDUNDANT or needs to be repurposed if it's used for something else.
# For now, it's commented out to resolve the conflict.
# @oppgaver_bp.route('/api/oppgave/<int:id>', methods=['POST'])
# @login_required
# def oppdater_oppgave(id):
#     # ... (original logic for POST) ...
#     pass


# This PATCH route is now MERGED INTO the 'update_existing_task' above.
# So this route is REDUNDANT and should be removed.
# @oppgave_api.route("/api/oppgave/<int:task_id>", methods=["PATCH"])
# @login_required
# def update_task_dates(task_id):
#    pass # Logic moved/merged


@oppgaver_bp.route('/opprett-oppgave', methods=['GET', 'POST'])
@login_required
def opprett_oppgave():
    if request.method == 'POST':
        tittel = request.form.get('title')
        ordrenummer = request.form.get('order_number')
        location = request.form.get('location')
        plassering = request.form.get('plassering')
        
        try:
            startdato = datetime.strptime(request.form.get('start_date'), "%Y-%m-%d").date()
            starttid = datetime.strptime(request.form.get('start_time'), "%H:%M").time()
            sluttdato = datetime.strptime(request.form.get('end_date'), "%Y-%m-%d").date()
            sluttid = datetime.strptime(request.form.get('end_time'), "%H:%M").time()
        except ValueError as e:
            flash(f"Feil dato/tid format: {e}", "danger")
            return redirect(url_for('oppgaver.ny_oppgave',
                                    start_date=request.form.get('start_date'),
                                    start_time=request.form.get('start_time'),
                                    end_date=request.form.get('end_date'),
                                    end_time=request.form.get('end_time')))

        status = request.form.get('status') or "aktiv"
        tekniker = request.form.get('technician')
        fag = request.form.get('fag')
        kunde_navn = request.form.get('customer_name')
        kunde_tlf = request.form.get('customer_phone')
        kunde_epost = request.form.get('customer_email')

        konflikter = Task.query.filter(
            Task.technician == tekniker,
            Task.status == 'aktiv',
            Task.start_date <= sluttdato,
            Task.end_date   >= startdato
        ).all()
        if konflikter:
            linjer = [f"{k.title} ({k.start_date.strftime('%d.%m.%Y')}–{k.end_date.strftime('%d.%m.%Y')})" for k in konflikter]
            flash("Tekniker er allerede opptatt på:\n" + "\n".join(linjer), "danger")
            return redirect(url_for('oppgaver.opprett_oppgave',
                                    dato=startdato.strftime("%Y-%m-%d"),
                                    tid=starttid.strftime("%H:%M")))

        oppgave = Task(
            title=tittel,
            location=location,
            plassering=plassering,
            start_date=startdato,
            start_time=starttid,
            end_date=sluttdato,
            end_time=sluttid,
            status=status,
            technician=tekniker,
            order_number=ordrenummer,
            fag=fag,
            customer_name=kunde_navn,
            customer_phone=kunde_tlf,
            customer_email=kunde_epost,
            opprettet_av=current_user.email
        )
        db.session.add(oppgave)
        db.session.commit()
        flash("Oppgave opprettet!", "success")
        return redirect(url_for('kalender.kalender'))

    teknikere = User.query.filter(func.lower(User.role) == 'tekniker', User.approved == True).all()
    dato_str = request.args.get('dato')
    tid_str = request.args.get('tid')
    default_date = datetime.today().strftime("%Y-%m-%d")
    default_start_time = tid_str or "08:00"
    default_end_time = "16:00"

    return render_template("opprett_oppgave.html",
        default_date=default_date,
        default_start_time=default_start_time,
        default_end_time=default_end_time,
        teknikere=teknikere
    )


@oppgaver_bp.route('/api/whoami')
@login_required
def whoami():
    return jsonify({
        "id": current_user.id,
        "email": current_user.email,
        "name": f"{current_user.first_name} {current_user.last_name}",
        "role": current_user.role,
        "employee_id": current_user.employee_id
    })


@oppgaver_bp.route("/api/ics/download_multiple", methods=["POST"])
@login_required
def download_multiple_ics():
    data = request.json
    selected_task_ids = data.get("task_ids", [])
    cancellation_revisions = data.get("cancellation_revisions", {}) # {taskId: [revId, ...]}

    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # --- 1. Legg til nye invitasjons-ICS-filer for valgte oppgaver ---
        for task_id in selected_task_ids:
            task = Task.query.get(task_id)
            if task:
                ensure_ics_uid(task)
                
                # Hent arrangør og deltaker e-post for INVITASJON
                organizer_email = current_user.email # Antar innlogget bruker (prosjektleder) er arrangør
                
                tekniker_for_invite = User.query.filter_by(email=task.technician).first()
                # Pass None om tekniker-objektet eller e-posten mangler, build_ics_string håndterer dette
                attendee_email = tekniker_for_invite.email if tekniker_for_invite and tekniker_for_invite.email else None 

                e = Event()
                e.uid = task.ics_uid
                e.sequence = task.ics_sequence
                e.method = "REQUEST"
                e.status = "CONFIRMED"
                e.name = f"{task.plassering} – {task.title}" if task.plassering else task.title
                
                start_dt = datetime.combine(task.start_date, task.start_time or datetime.min.time())
                end_dt = datetime.combine(task.end_date, task.end_time or datetime.min.time())

                e.begin = start_dt.replace(tzinfo=timezone.utc)
                if task.end_time is None: # It was an all-day event
                    e.end = (end_dt + timedelta(days=1)).replace(tzinfo=timezone.utc)
                else: # It was a timed event
                    e.end = end_dt.replace(tzinfo=timezone.utc)
                
                e.location = task.plassering or ""
                e.description = f"Ordrenummer: {task.order_number or ''}\n\nKommentar:\n{getattr(task, 'kommentar', '') or ''}\n\nHa en strålende dag videre og lykke til på oppdraget 🙂"

                # --- Inkludere vedlegg som URIer ---
                if hasattr(task, 'attachments') and task.attachments: # Sjekk om oppgaven har vedlegg
                    from app.models.attachment import Attachment # MÅ IMPORTERES HØYEST I FILEN ELLER HER
                    for attachment in task.attachments:
                        # Dette 'download_attachment' er et ANTATT rutenavn i din app.routes.kravsporing blueprint.
                        # Sjekk DITT rutenavn for nedlasting av vedlegg!
                        attachment_url = url_for('kravsporing.download_attachment', # EKSEMPEL: url_for('kravsporing.download_attachment'
                                                task_id=task.id,
                                                filename=attachment.filename,
                                                _external=True) # VIKTIG: _external=True for full URL i ICS
                        
                        # Legg til vedlegget i event-objektet
                        # ics.py Event-objektet har en .attachments liste. Legg til et Attachment-objekt.
                        # Vær obs på om Attachment-objektet fra ics.py tar 'uri' eller 'url'
                        # if ics.__version__ < '0.8': # eldre versjoner
                        #    e.attachments.append(Attachment(uri=attachment_url, mime_type=attachment.mimetype))
                        # else: # nyere versjoner av ics.py
                        e.attachments.append(Attachment(url=attachment_url, mime_type=attachment.mimetype)) # Bruk 'url' keyword


                # Bruk build_ics_string med korrekt ORGANIZER og ATTENDEE for invitasjon
                ics_text_invite = build_ics_string(e, "REQUEST", organizer_email, attendee_email)

                filename = f"oppgave_{task.id}_{task.title.replace(' ', '_')}_invitasjon.ics"
                zf.writestr(filename, ics_text_invite.encode("utf-8"))

        # --- 2. Legg til kansellerings-ICS-filer for valgte revisjoner ---
        for task_id_str, rev_ids in cancellation_revisions.items():
            task_id = int(task_id_str)
            for rev_id in rev_ids:
                revision = TaskRevision.query.get(rev_id)
                # Viktig: revision.task er relasjonen til hovedoppgaven
                if revision and revision.task_id == task_id and revision.task: 
                    # Hent arrangør og deltaker e-post for KANSELLERING
                    organizer_email = current_user.email # Antar innlogget bruker er arrangør
                    
                    tekniker_for_cancel = User.query.filter_by(email=revision.task.technician).first()
                    attendee_email = tekniker_for_cancel.email if tekniker_for_cancel and tekniker_for_cancel.email else None 

                    old_start_dt = datetime.combine(revision.old_start_date, revision.old_start_time or datetime.min.time())
                    old_end_dt = datetime.combine(revision.old_end_date, revision.old_end_time or datetime.min.time())
                    old_is_all_day = (revision.old_start_time is None and revision.old_end_time is None)

                    e_cancel = Event()
                    e_cancel.uid = revision.task.ics_uid
                    e_cancel.sequence = revision.ics_sequence
                    e_cancel.status = "CANCELLED"
                    e_cancel.method = "CANCEL"
                    e_cancel.name = revision.old_title or f"Avbestilling av oppgave {task_id}"

                    e_cancel.begin = old_start_dt.replace(tzinfo=timezone.utc)
                    if old_is_all_day:
                        e_cancel.end = (old_end_dt + timedelta(days=1)).replace(tzinfo=timezone.utc)
                    else:
                        e_cancel.end = old_end_dt.replace(tzinfo=timezone.utc)

                    # Ingen vedlegg i kansellerings-ICS (mindre vanlig)

                    # Bruk build_ics_string med korrekt ORGANIZER og ATTENDEE for kansellering
                    ics_text_cancel = build_ics_string(e_cancel, "CANCEL", organizer_email, attendee_email)

                    filename = f"oppgave_{task_id}_rev_{revision.ics_sequence}_kansellering.ics"
                    zf.writestr(filename, ics_text_cancel.encode("utf-8"))

    zip_buffer.seek(0)
    
    return send_file(zip_buffer,
                     mimetype='application/zip',
                     as_attachment=True,
                     download_name='kalender_oppgaver.zip')