# app/helligdager.py
import datetime
import holidays

def hent_norske_helligdager(år=None):
    år = år or datetime.date.today().year
    norske_helligdager = holidays.Norway(years=[år])
    return [
        {
            "title": name,
            "start": str(dato),
            "end": str(dato),
            "display": "background",
            "overlap": False,
            "color": "rgba(180,180,180,0.25)"
        }
        for dato, name in norske_helligdager.items()
    ]
