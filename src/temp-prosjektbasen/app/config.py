# -*- coding: utf-8 -*-
"""
Denne filen inneholder statisk konfigurasjon for kravsporingsapplikasjonen.
Ved å samle disse dataene her, holdes logikk-filene (som tasks.py) renere
og det blir enklere å justere domenespesifikke verdier uten å endre koden.
"""

import re
import os
from pathlib import Path

# Definerer en base-sti slik at stier til datafiler er relative og robuste.
CURRENT_DIR = Path(__file__).resolve().parent # Peker til 'app'-mappen

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true"
CELERY_TASK_EAGER_PROPAGATES = True

# === Kravsverb ===
# En samling av verb og ord som indikerer et normativt utsagn eller krav.
GLOBAL_OBLIGATION_VERBS = {
    "skal", "må", "kreves", "komplett", "kreve", "leveres", "levere", "installeres", "monteres",
    "prosjekteres", "sikre", "utføres", "dokumenteres", "ber", "inngår", "består", "utgjør",
    "påkrevd", "obligatorisk", "forutsatt", "plikt", "ansvarlig", "forpliktet", "sørge", "bekrefter",
    "ivaretatt", "fremgår", "påse", "dekke", "godkjent", "utarbeides", "tilpasses", "informerer",
    "fremmer", "oversendes", "anses", "omfatter", "bidrar", "gjennomføre", "avtales", "benytte",
    "holde", "stiller", "tilbyr", "sørger", "pålagt", "nødvendig", "etterspurt", "forventet",
    "påbudt", "etterleve", "implementere", "overholde", "sikret", "bekreftet", "iverksette",
    "tilrettelegge", "gjennomføres", "oppfylle", "fullføre", "måtte", "opprettholde", "etablere",
    "utskiftes", "fornyes", "besørge", "legges", "opprettholdes", "klargjøres", "demonteres",
    "fjernes", "borttas", "godkjenne", "tillates", "verifisere", "kontrolleres", "følges",
    "respektere", "overleveres", "overføres", "tilbakeføres", "reduseres", "minimeres",
    "forhindres", "unngås", "opprette", "registreres", "protokollføres", "arkiveres",
    "oppdateres", "bevares", "hindres", "utredes", "utbedres", "etterse", "ettergå",
    "aksepteres", "autoriseres", "vernes"
}

# --- Domeneprofiler (per fag) ---
# Definerer nøkkeltermer, aliaser og enhetsmønstre for ulike fagområder.
DOMAIN_PROFILES = {
    # Fallback når vi ikke vet fag: bred, men trygg
    "generic": {
        "aliases": [],
        "terms": set(),
        "units_re": re.compile(
            r"(\b-?\d+[.,]?\d*\s*(?:ppm|%|°\s*c|k?w|w|k?va|var|db(?:\s*\(a\))?|pa|kpa)\b)"
            r"|(\b[<>]=?\s*-?\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },

    "ventilasjon": {
        "aliases": [
            "ventilasjon", "ventilasjonsanlegg", "tilluft", "avtrekk", "overstrøm",
            "vav", "vav-spjeld", "cav", "dcv", "undertrykk", "overtrykk", "trykksetting",
            "dut", "dimensjonerende utetemperatur", "utetemperatur", "tilluftstemperatur",
            "operativ temperatur", "romtemperatur"
        ],
        "terms": {
            "ventilasjon", "ventilasjonsanlegg", "tilluft", "avtrekk", "overstrøm", "vav",
            "vav-spjeld", "cav", "dcv", "sfp", "kW/(m³/s)", "w/(m³/s)", "m³/s", "m3/s",
            "m³/m²h", "l/s per person", "co2", "co₂", "ppm", "pa", "kpa", "trykkfall",
            "trykkdifferanse", "undertrykk", "overtrykk", "trykksetting", "dut",
            "dimensjonerende utetemperatur", "utetemperatur", "tilluftstemperatur",
            "operativ temperatur", "romtemperatur", "°c", "varmegjenvinning",
            "temperaturvirkningsgrad", "ns-en 12599", "ns-en 16798", "en iso 16890"
        },
        "units_re": re.compile(
            r"(\b-?\d+[.,]?\d*\s*(?:m\s*[³3]|m\s*[²2]|m\s*[³3]\s*/\s*s|m\s*[³3]\s*/\s*m\s*[²2]\s*/\s*t|"
            r"l/s|l/min|m³/h|ppm|k\s*w|kw|w|°\s*c|pa|kpa)\b)|(\b[<>]=?\s*-?\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },

    "elektro": {
        "aliases": [
            "elektro", "el", "strøm", "belysning", "lys", "brannalarm", "nødlys",
            "adgang", "ik", "ip", "ups", "tavle", "nek 400"
        ],
        "terms": {
            "elektro", "strøm", "kabel", "kurs", "vern", "rcd", "belysning", "lux",
            "armatur", "dali", "brannalarm", "detektor", "nødlys", "adgangskontroll",
            "kortleser", "ups", "hovedtavle", "ip", "ik", "nek 400", "hz", "v", "kv",
            "a", "ka", "ω", "ohm", "mm²", "cos φ"
        },
        "units_re": re.compile(
            r"(\b\d+[.,]?\d*\s*(?:v|kv|a|ka|w|kw|kva|hz|lux|db(?:\s*\(a\))?|mm²|mm2|ω|ohm)\b)"
            r"|(\bip\d{2}\b)|(\bik\d{2}\b)|(\bik\s*\d+[.,]?\d*\s*k?a\b)",
            re.IGNORECASE
        ),
    },

    "rørlegger": {
        "aliases": ["rør", "vvs", "sanitær", "sprinkler", "vann", "avløp", "legionella"],
        "terms": {
            "vann", "avløp", "spillvann", "sanitær", "rør", "pumpe", "fettutskiller", "bereder",
            "varmtvann", "sprinkler", "sprinklersentral", "ns-en 12845", "lekkasjesikring",
            "trykktest", "legionella", "tilbakestrømssikring", "dn"
        },
        "units_re": re.compile(
            r"(\b-?\d+[.,]?\d*\s*(?:l/s|l/min|m³/h|bar|kpa|pa|°\s*c)\b)|(\bdn\s*\d+\b)|"
            r"(\b[<>]=?\s*-?\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },

    "byggautomasjon": {
        "aliases": ["sd", "bms", "bas", "byggautomasjon", "bacnet", "modbus", "knx"],
        "terms": {
            "byggautomasjon", "sd", "bms", "bacnet", "modbus", "knx", "opc ua", "mqtt", "io",
            "i/o", "pid", "regulator", "setpunkt", "romkontroller", "trendlogg", "alarmer"
        },
        "units_re": re.compile(
            r"(\b-?\d+[.,]?\d*\s*(?:°\s*c|%|ppm|kwh|wh|s|min|ms)\b)|(\b[<>]=?\s*-?\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },

    "kulde": {
        "aliases": ["kulde", "kjøleanlegg", "chiller", "dx", "varmepumpe", "f-gass"],
        "terms": {
            "f-gass", "kuldemedium", "r32", "r410a", "r290", "r744", "kompressor",
            "kondensator", "fordamper", "cop", "eer", "seer", "scop", "gwp"
        },
        "units_re": re.compile(
            r"(\b-?\d+[.,]?\d*\s*(?:kw|w|°\s*c|kpa|pa)\b)|(\b(cop|eer|seer|scop)\s*[>=]?\s*\d+[.,]?\d*\b)|"
            r"(\b[<>]=?\s*-?\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },

    "totalentreprenør": {
        "aliases": ["totalentreprenør", "entreprenør", "te"],
        "terms": {
            "ns 8407", "framdriftsplan", "sha-plan", "kvalitetssystem", "kontrollplan",
            "as built", "fdv", "prøvedrift", "overtakelse", "endringsordre", "dokumentasjon"
        },
        "units_re": re.compile(
            r"(\b\d+[.,]?\d*\s*(?:%|dager|uke|uker|måneder|timer|kr)\b)|(\b[<>]=?\s*\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },

    "byggherre": {
        "aliases": ["byggherre", "bh", "oppdragsgiver"],
        "terms": {
            "kravdokument", "funksjonskrav", "romprogram", "opsjon", "møtereferat", "godkjenne"
        },
        "units_re": re.compile(
            r"(\b\d+[.,]?\d*\s*(?:%|dager|uke|uker|måneder|kr)\b)|(\b[<>]=?\s*\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },

    "økonomi": {
        "aliases": ["økonomi", "kontrakt", "kostnad", "pris", "fakturaplan"],
        "terms": {
            "dagmulkt", "vederlag", "opsjonspris", "indeksregulering", "ns 3420",
            "fakturaplan", "enhetspris", "timepris", "kontraktssum", "betalingsplan"
        },
        "units_re": re.compile(
            r"(\b\d+[.,]?\d*\s*(?:%|kr|nok|eur|usd)\b)|(\b[<>]=?\s*\d+[.,]?\d*\b)",
            re.IGNORECASE
        ),
    },
}

# Generelt regex-mønster for å fange opp numeriske verdier og enheter.
UNITS_REGEX = re.compile(
    r"(\b-?\d+[.,]?\d*\s*(?:"
    r"m\s*[³3]|m\s*[²2]|"          # m³ / m²
    r"m\s*[³3]\s*/\s*s|"            # m³/s
    r"m\s*[³3]\s*/\s*m\s*[²2]\s*/\s*t|" # m³/m²/t
    r"l/s|l/min|m³/h|"              # vanlige VVS-enheter
    r"ppm|k\s*w|kw|w|°\s*c|pa|kpa"  # °C, Pa/kPa, kW/W
    r")\b)|(\b[<>]=?\s*-?\d+[.,]?\d*\b)",
    flags=re.IGNORECASE
)

# === Klassifisering / farger ===
# Mønstre for å klassifisere kravtyper og fargekoder for rapportering.
regex_patterns = {
    "installasjon": [r"\b(montere|installer|kobles til|settes opp|montasje|tetting|hull|påstøpes|festes|ankres|forbindes|oppheng)\b"],
    "leveranse": [r"\b(leveres|inkludert|medfølger|omfatter|bestilles|komplett|tilbys|tilgjengelig)\b"],
    "dokumentasjon": [r"\b(fdv|manual|datablad|protokoll|dokumentasjon|breeam|ns3935|ns6450|brukerveiledning|sertifikat|opplæring)\b"],
    "miljø/energi": [r"\b(breeam|energi(?:måler|beregning)|epc|miljø(?:profil|rapport)|co2|klimagass|energieffektivisering)\b"],
    "opsjon": [r"\b(valgfritt|opsjon|kan leveres|ekstra|opsjonelt|mulighet for)\b"]
}
KRAVTYPE_COLORS = {
    "installasjon": "FFFF99", "leveranse": "CCFFCC", "dokumentasjon": "CCCCFF",
    "opsjon": "FFCCFF", "krav": "DDDDDD", "generell": "DED8EB", "miljø/energi": "FFC285"
}
GROUP_COLORS = {
    "byggherre": "FFD966", "totalentreprenør": "FCE5CD", "elektro": "FFF2CC",
    "ventilasjon": "D0E0E3", "rørlegger": "EAD1DC", "byggautomasjon": "CCE5FF",
    "prosjektering": "D9D2E9", "økonomi": "FFF0F5", "Uspesifisert": "EEEEEE",
    "elektro, prosjektering": "FCE5CD", "ventilasjon, prosjektering": "D9D2E9",
    "rørlegger, prosjektering": "F4CCCC", "byggautomasjon, prosjektering": "D9EAD3",
    "elektro, økonomi": "FAFAD2", "ventilasjon, økonomi": "E0FFFF",
    "rørlegger, økonomi": "FFE4E1", "byggautomasjon, økonomi": "F0FFF0",
    "GK": "D9EAD3", "Bravida": "CFE2F3", "Caverion": "FCE5CD", "Vestrheim": "F4CCCC"
}

# Stier til NS-standarder som brukes for semantisk søk.
PDF_STANDARDER = {
    "NS8415": {"path": str(CURRENT_DIR / "data/NS8415.pdf"), "aktiv": True},
    "NS8417": {"path": str(CURRENT_DIR / "data/NS8417.pdf"), "aktiv": True}
}