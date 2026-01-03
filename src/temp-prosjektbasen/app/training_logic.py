# app/training_logic.py
# -*- coding: utf-8 -*-
"""
Delt logikk for AI-trening og databehandling.

Bruksmønster:
- learn_from_payload({"requirements": [...]}) → oppdaterer korpus (CSV/TXT) basert på reviderte krav.
- run_training() → kjører eksterne treningsskript og returnerer stdout/stderr/status.

Denne modulen er uavhengig av Flask/Celery og kan kalles fra både web- og worker-lag.
"""

from __future__ import annotations

import os
import sys
import subprocess
import csv, json, unicodedata as _ud
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import suppress
from dataclasses import dataclass

# -----------------------------------------------------------------------------
# Stier
# -----------------------------------------------------------------------------
APP_DIR: Path = Path(__file__).resolve().parent            # .../app
PROJECT_ROOT: Path = APP_DIR.parent                        # prosjektrot
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
CSV_KRAV: Path = DATA_DIR / "krav_med_domener.csv"
TXT_IKKE_KRAV: Path = DATA_DIR / "ikke_krav.txt"
PKL_FAG_PROFILER: Path = DATA_DIR / "fag_profiler.pkl"
PKL_KRAV_VALIDATOR: Path = DATA_DIR / "krav_validator.pkl"


# -----------------------------------------------------------------------------
# Hjelpere for encoding og filhåndtering
# -----------------------------------------------------------------------------
def write_csv_utf8_sig(path, rows, header):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow([_ud.normalize("NFC", h) for h in header])
        for r in rows:
            w.writerow([_ud.normalize("NFC", str(x) if x is not None else "") for x in r])

def write_json_utf8(path, obj):
    def _norm(x): return _ud.normalize("NFC", x) if isinstance(x, str) else x
    normed = json.loads(json.dumps(obj, ensure_ascii=False), object_hook=lambda d: {k: _norm(v) for k, v in d.items()})
    with open(path, "w", encoding="utf-8") as f:
        json.dump(normed, f, ensure_ascii=False, indent=2)
        
def _norm_no(s: str) -> str:
    if not s:
        return ""
    s = _ud.normalize("NFKC", str(s))
    return s.casefold().strip()

def _ensure_utf8_file(path: Path) -> None:
    """Sikrer at en fil er UTF-8 med LF-linjeskift."""
    if not path.exists():
        return
    try:
        txt = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            txt = path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError:
            raw = path.read_bytes()
            txt = raw.decode("latin-1", errors="ignore")
    txt = txt.replace("\r\n", "\n").replace("\r", "\n")
    if txt and not txt.endswith("\n"):
        txt += "\n"
    path.write_text(txt, encoding="utf-8")


def _normalize_data_dir(directory: Path) -> None:
    """Kjører _ensure_utf8_file på .csv, .txt, og .json i en mappe."""
    if not directory.is_dir():
        return
    for p in directory.iterdir():
        if p.is_file() and p.suffix.lower() in {".csv", ".txt", ".json"}:
            with suppress(Exception):
                _ensure_utf8_file(p)


def _json_load_any(path: Path):
    """Leser en JSON-fil trygt. Returnerer {} ved feil."""
    if not path.exists():
        return {}
    try:
        _ensure_utf8_file(path)
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


# -----------------------------------------------------------------------------
# Funksjoner for håndtering av treningsdata (korpus)
# -----------------------------------------------------------------------------
def _as_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except Exception:
        return default

@dataclass(frozen=True)
class ExtractConfig:
    kw_strong: float
    sem_strong: float
    w_kw: float
    w_sem: float
    ai_min_thr: float

# Hent fra miljø, med trygge defaults
EXTRACT_CFG = ExtractConfig(
    kw_strong=_as_float("KS_KW_STRONG", 0.80),
    sem_strong=_as_float("KS_SEM_STRONG", 0.83),
    w_kw=_as_float("KS_W_KW", 0.65),
    w_sem=_as_float("KS_W_SEM", 0.35),
    ai_min_thr=_as_float("KS_AI_MIN_THR", 0.60),
)

def _read_csv_krav() -> Dict[str, str]:
    """Leser 'krav_med_domener.csv' og returnerer en dict med {tekst: fag}."""
    data: Dict[str, str] = {}
    if not CSV_KRAV.exists():
        CSV_KRAV.parent.mkdir(parents=True, exist_ok=True)
        CSV_KRAV.write_text("tekst;fag\n", encoding="utf-8-sig")
        return data

    _ensure_utf8_file(CSV_KRAV)

    # Les med utf-8-sig for å tåle BOM fra/til Excel
    with open(CSV_KRAV, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    if not rows:
        return data

    # Skipp header hvis til stede
    first = rows[0] if rows else None
    has_header = bool(first and len(first) >= 2 and first[0].strip().lower() == "tekst")
    start = rows[1:] if has_header else rows

    for row in start:
        if len(row) >= 2:
            text = " ".join(str(row[0] or "").split()).strip()
            fag = " ".join(str(row[1] or "").split()).strip() or "Uspesifisert"
            if text:
                data[text] = fag
    return data


def _write_csv_krav(mapping: Dict[str, str]) -> None:
    """Skriver en dict med {tekst: fag} til 'krav_med_domener.csv'."""
    CSV_KRAV.parent.mkdir(parents=True, exist_ok=True)
    # Skriv med utf-8-sig for at Excel skal vise æ/ø/å korrekt
    with open(CSV_KRAV, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["tekst", "fag"])
        for text, fag in sorted(mapping.items(), key=lambda kv: kv[0].casefold()):
            writer.writerow([text, fag or "Uspesifisert"])


def _append_negatives(lines: List[str]) -> int:
    """Legger til nye linjer i 'ikke_krav.txt' hvis de ikke allerede finnes."""
    if not lines:
        return 0

    TXT_IKKE_KRAV.parent.mkdir(parents=True, exist_ok=True)
    _ensure_utf8_file(TXT_IKKE_KRAV)

    existing = set()
    if TXT_IKKE_KRAV.exists():
        existing.update(
            " ".join(line.split()).strip()
            for line in TXT_IKKE_KRAV.read_text(encoding="utf-8").splitlines()
            if line.strip()
        )

    added_count = 0
    with open(TXT_IKKE_KRAV, "a", encoding="utf-8") as f:
        for line in lines:
            clean_line = " ".join(line.split()).strip()
            if clean_line and clean_line not in existing:
                f.write(clean_line + "\n")
                existing.add(clean_line)
                added_count += 1
    return added_count


def _merge_review_into_corpus(requirements: List[dict]) -> Dict[str, int]:
    """
    Oppdaterer korpus-filene basert på en liste med reviderte krav.
    - 'Aktiv' status → CSV
    - 'Inaktiv' status → TXT
    Returnerer en rapport over endringer.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _normalize_data_dir(DATA_DIR)
    positive_map = _read_csv_krav()
    negative_lines: List[str] = []

    added_pos, updated_pos = 0, 0

    for req in requirements or []:
        text = " ".join(str(req.get("text", "")).split()).strip()
        status = str(req.get("status", "Aktiv")).strip().lower()
        fag_list = req.get("fag")
        fag = "Uspesifisert"

        if isinstance(fag_list, list) and fag_list:
            fag = " ".join(str(fag_list[0]).split()).strip()

        if not text:
            continue

        if status == "inaktiv":
            negative_lines.append(text)
            # Fjern fra positive hvis den eksisterte der
            if text in positive_map:
                del positive_map[text]
        else:  # Antar 'Aktiv'
            if text not in positive_map:
                positive_map[text] = fag
                added_pos += 1
            elif positive_map[text] != fag:
                positive_map[text] = fag
                updated_pos += 1

    _write_csv_krav(positive_map)
    added_neg = _append_negatives(negative_lines)

    return {"csv_added": added_pos, "csv_updated": updated_pos, "neg_added": added_neg}


# -----------------------------------------------------------------------------
# Kjør eksterne treningsskript
# -----------------------------------------------------------------------------
def _find_script(script_name: str) -> Optional[Path]:
    """Finner et treningsskript ved å sjekke flere vanlige plasseringer."""
    candidates = [
        PROJECT_ROOT / script_name,
        APP_DIR / script_name,
        DATA_DIR / script_name,
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def _run_training() -> Dict[str, Any]:
    """
    Kjører de to treningsskriptene via subprocess og fanger opp resultatet.
    Returnerer en dict med status, stdout og stderr for hver jobb.
    """
    result: Dict[str, Any] = {
        "fag_ok": False, "fag_stdout": "", "fag_stderr": "",
        "val_ok": False, "val_stdout": "", "val_stderr": "",
        "resolved_paths": {},
    }

    fag_script_path = _find_script("train_fag_classifier.py")
    val_script_path = _find_script("train_validator.py")
    python_executable = sys.executable or "python"

    result["resolved_paths"] = {
        "fag_script": str(fag_script_path) if fag_script_path else "Not Found",
        "val_script": str(val_script_path) if val_script_path else "Not Found",
        "python": python_executable
    }

    # Sørg for at 'app' kan importeres i treningsskript uansett startkatalog
    env = os.environ.copy()
    py_path = env.get("PYTHONPATH", "")
    roots = [str(PROJECT_ROOT), str(APP_DIR)]
    env["PYTHONPATH"] = os.pathsep.join(
        [p for p in (roots + py_path.split(os.pathsep)) if p and p not in py_path.split(os.pathsep)]
    )
    # Normaliser/etabler datafiler før kjøring
    _read_csv_krav()                 # oppretter CSV med header ved behov
    if not TXT_IKKE_KRAV.exists():
        TXT_IKKE_KRAV.parent.mkdir(parents=True, exist_ok=True)
        TXT_IKKE_KRAV.write_text("", encoding="utf-8")
    _ensure_utf8_file(TXT_IKKE_KRAV)

    run_kwargs = {
        "capture_output": True,
        "text": True,
        "encoding": "utf-8",
        "cwd": str(PROJECT_ROOT),
        "env": env,
    }

    # Kjør fag-klassifiseringstrening
    if fag_script_path:
        cmd1 = [
            python_executable, str(fag_script_path),
            "--csv-path", str(CSV_KRAV),
            "--out-file", str(PKL_FAG_PROFILER),
            "--sep", ";"
        ]
        try:
            proc1 = subprocess.run(cmd1, timeout=300, **run_kwargs)
            result.update({
                "fag_ok": proc1.returncode == 0,
                "fag_stdout": proc1.stdout or "",
                "fag_stderr": proc1.stderr or "",
            })
        except subprocess.TimeoutExpired as e:
            result.update({
                "fag_ok": False,
                "fag_stdout": e.stdout or "",
                "fag_stderr": f"Timeout (300s) på fag-trening: {e}",
            })
        except Exception as e:
            result.update({
                "fag_ok": False,
                "fag_stdout": "",
                "fag_stderr": f"Uventet feil i fag-trening: {e}",
            })
    else:
        result["fag_stderr"] = "Treningsskript 'train_fag_classifier.py' ble ikke funnet."

    # Kjør krav-validator-trening
    if val_script_path:
        cmd2 = [
            python_executable, str(val_script_path),
            "--csv-file", str(CSV_KRAV),
            "--sep", ";",
            "--ikke-krav", str(TXT_IKKE_KRAV),
            "--out-file", str(PKL_KRAV_VALIDATOR)
        ]
        try:
            proc2 = subprocess.run(cmd2, timeout=300, **run_kwargs)
            result.update({
                "val_ok": proc2.returncode == 0,
                "val_stdout": proc2.stdout or "",
                "val_stderr": proc2.stderr or "",
            })
        except subprocess.TimeoutExpired as e:
            result.update({
                "val_ok": False,
                "val_stdout": e.stdout or "",
                "val_stderr": f"Timeout (300s) på validator-trening: {e}",
            })
        except Exception as e:
            result.update({
                "val_ok": False,
                "val_stdout": "",
                "val_stderr": f"Uventet feil i validator-trening: {e}",
            })
    else:
        result["val_stderr"] = "Treningsskript 'train_validator.py' ble ikke funnet."

    # Ekstra kontekst ved feilsøking
    result["resolved_paths"].update({
        "cwd": str(PROJECT_ROOT),
        "data_dir": str(DATA_DIR),
        "csv_path": str(CSV_KRAV),
        "neg_path": str(TXT_IKKE_KRAV),
        "pkl_fag": str(PKL_FAG_PROFILER),
        "pkl_val": str(PKL_KRAV_VALIDATOR),
    })
    return result


# -----------------------------------------------------------------------------
# Offentlige API-funksjoner (kalles fra Celery-oppgaver / web)
# -----------------------------------------------------------------------------
def learn_from_payload(payload: Dict[str, Any]) -> Dict[str, int]:
    """
    Oppdaterer korpus basert på UI-payload; normaliserer æ/ø/å (NFC), validerer felt og sender videre til _merge_review_into_corpus.
    Returnerer teller-rapport fra fletteprosessen.
    """
    import unicodedata as _ud

    # 1) Hent og valider liste
    reqs = payload.get("requirements") if isinstance(payload, dict) else None
    if not isinstance(reqs, list):
        return {"csv_added": 0, "csv_updated": 0, "neg_added": 0}

    # 2) NFC-normaliser og rens minstekrav til felter (tekst, status, fag)
    cleaned: list[Dict[str, Any]] = []
    for r in reqs:
        if not isinstance(r, dict):
            continue
        txt = r.get("text") or r.get("full_text") or r.get("kravtekst") or ""
        txt = _ud.normalize("NFC", str(txt)).strip()
        if not txt:
            continue

        status = (r.get("status") or "Aktiv").strip()
        status = _ud.normalize("NFC", status)
        fag = r.get("fag") or []
        if isinstance(fag, str):
            fag = [fag]
        fag = [_ud.normalize("NFC", str(x)).strip() for x in fag if str(x).strip()]

        cleaned.append({**r, "text": txt, "status": status, "fag": fag})

    if not cleaned:
        return {"csv_added": 0, "csv_updated": 0, "neg_added": 0}

    # 3) Send videre til eksisterende flettefunksjon (den håndterer CSV/NEG-oppdatering)
    return _merge_review_into_corpus(cleaned)

def run_training() -> Dict[str, Any]:
    """
    Kjør treningsrutinene og returner status; kapsler _run_training og legger på 'ok'-flagg  sti-info hvis tilgjengelig.
    """
    try:
        res = _run_training()  # forventer dict
        if not isinstance(res, dict):
            res = {"detail": str(res)}
        # Sett et omforent OK-flagg når minst én delrapport er suksess
        ok = any(res.get(k) for k in ("fag_ok", "val_ok", "ok"))
        res.setdefault("ok", bool(ok))
        return res
    except Exception as e:
        return {"ok": False, "error": "training_failed", "detail": str(e)}


# Eksplisitt eksport
__all__ = [
    "DATA_DIR",
    "CSV_KRAV",
    "TXT_IKKE_KRAV",
    "PKL_FAG_PROFILER",
    "PKL_KRAV_VALIDATOR",
    "learn_from_payload",
    "run_training",
]
