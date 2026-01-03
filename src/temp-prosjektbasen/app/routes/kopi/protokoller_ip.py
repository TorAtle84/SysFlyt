# Fil: app/routes/protokoller_ip.py

import os, json
from flask import request, Response, stream_with_context, jsonify
from flask_login import login_required

# Hent alt vi trenger fra core – samme blueprint og parsere
from .protokoller_core import (
    bp,
    extract_text_from_file,
    parse_rows_from_text,
)

@bp.route("/generate_innreguleringsprotokoll", methods=["POST"])
@login_required
def generate_innreguleringsprotokoll():
    """
    Innregulering: returnér vanlig JSON (ikke streaming).
    """
    files = request.files.getlist("files")
    system_kriterier_str = (request.form.get("system_kriterier", "") or "").strip()
    system_valg = {s.strip() for s in system_kriterier_str.split(",") if s.strip()}

    out = []
    for f in files:
        if not f or not f.filename:
            continue
        try:
            f.seek(0)
        except Exception:
            pass
        try:
            text = extract_text_from_file(f)
            for row in parse_rows_from_text(text, f.filename):
                sysid = row["unique_system"]
                if system_valg and not any(sysid.startswith(crit) for crit in system_valg):
                    continue
                out.append({
                    "source": row["source"],
                    "system": row["unique_system"],
                    "komponent": row["komponent"],
                    "vMin": "-",
                    "vMid": "-",
                    "vMaks": "-"
                })
        except Exception as e:
            print("[INNREG][FEIL]", f.filename, e)

    return jsonify(out)

