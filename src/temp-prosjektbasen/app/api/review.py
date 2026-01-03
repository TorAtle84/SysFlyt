# app/api/review.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from pathlib import Path
import json
import csv
import datetime

router = APIRouter(prefix="/review", tags=["review"])
BASE_TEMP = Path("app/temp")

# ---------- Models ----------

class ItemPatch(BaseModel):
    keep: Optional[bool] = None
    gruppe: Optional[str] = None
    label: Optional[str] = None     # valgfri egen etikett for trening
    note: Optional[str] = None       # kort kommentar

class ItemPatchWithIdx(ItemPatch):
    idx: int                         # hvilken rad i lista som skal patches

class BulkPatch(BaseModel):
    items: List[ItemPatchWithIdx] = Field(default_factory=list)

# ---------- Helpers ----------

def _run_dir(run_id: str) -> Path:
    return BASE_TEMP / run_id

def _results_path(run_id: str) -> Path:
    return _run_dir(run_id) / "results.json"

def _curated_path(run_id: str) -> Path:
    return _run_dir(run_id) / "results_curated.json"

def _load_items(run_id: str) -> list:
    """
    Leser kuraterte resultater dersom de finnes, ellers original results.json.
    Sikrer at standardfelter finnes.
    """
    p = _curated_path(run_id)
    if p.exists():
        items = json.loads(p.read_text(encoding="utf-8"))
    else:
        p = _results_path(run_id)
        if not p.exists():
            raise HTTPException(status_code=404, detail=f"results.json ikke funnet for '{run_id}'")
        items = json.loads(p.read_text(encoding="utf-8"))

    for it in items:
        it.setdefault("keep", True)
        it.setdefault("label", "")
        it.setdefault("note", "")
        # preferer eksisterende gruppe/fag
        it.setdefault("gruppe", it.get("fag") or "Uspesifisert")
    return items

def _save_items(run_id: str, items: list):
    _curated_path(run_id).write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

# ---------- Routes ----------

@router.get("/runs")
def list_runs():
    """
    Finner alle mapper i app/temp som inneholder results.json
    """
    out = []
    if not BASE_TEMP.exists():
        return out
    for d in sorted([p for p in BASE_TEMP.iterdir() if p.is_dir()], key=lambda x: x.name):
        r = d / "results.json"
        if r.exists():
            try:
                n = len(json.loads(r.read_text(encoding="utf-8")))
            except Exception:
                n = None
            mtime = datetime.datetime.fromtimestamp(r.stat().st_mtime).isoformat()
            out.append({"run_id": d.name, "items": n, "modified": mtime})
    return out

@router.get("/{run_id}/items")
def get_items(run_id: str):
    """
    Returnerer liste med funn i en kjøring. Index i lista fungerer som 'idx'.
    """
    items = _load_items(run_id)

    def row(i, it):
        return {
            "idx": i,
            "keyword": it.get("keyword"),
            "short_text": it.get("short_text"),
            "text": it.get("text"),
            "kravtype": it.get("kravtype"),
            "score": it.get("score"),
            "ref": it.get("ref"),
            "gruppe": it.get("gruppe", "Uspesifisert"),
            "label": it.get("label", ""),
            "keep": it.get("keep", True),
            "note": it.get("note", ""),
        }

    return [row(i, it) for i, it in enumerate(items)]

@router.patch("/{run_id}/items/bulk")
def patch_bulk(run_id: str, payload: BulkPatch):
    """
    Patcher flere rader i ett kall. Brukes av UI for 'Lagre endringer'.
    """
    items = _load_items(run_id)
    applied = 0
    for p in payload.items:
        if 0 <= p.idx < len(items):
            it = items[p.idx]
            if p.keep is not None:
                it["keep"] = p.keep
            if p.gruppe is not None:
                it["gruppe"] = p.gruppe
            if p.label is not None:
                it["label"] = p.label
            if p.note is not None:
                it["note"] = p.note
            applied += 1
    _save_items(run_id, items)
    return {"ok": True, "updated": applied, "total": len(payload.items)}

@router.patch("/{run_id}/items/{idx}")
def patch_item(run_id: str, idx: int, patch: ItemPatch):
    items = _load_items(run_id)
    if idx < 0 or idx >= len(items):
        raise HTTPException(status_code=404, detail="Ugyldig idx")
    it = items[idx]
    if patch.keep is not None:
        it["keep"] = patch.keep
    if patch.gruppe is not None:
        it["gruppe"] = patch.gruppe
    if patch.label is not None:
        it["label"] = patch.label
    if patch.note is not None:
        it["note"] = patch.note
    _save_items(run_id, items)
    return {"ok": True, "idx": idx}

@router.delete("/{run_id}/items/{idx}")
def delete_item(run_id: str, idx: int):
    """
    Myk sletting: sett keep=False og note += '[deleted]'
    """
    items = _load_items(run_id)
    if idx < 0 or idx >= len(items):
        raise HTTPException(status_code=404, detail="Ugyldig idx")
    items[idx]["keep"] = False
    tag = items[idx].get("note", "")
    items[idx]["note"] = (tag + " [deleted]").strip()
    _save_items(run_id, items)
    return {"ok": True, "idx": idx}

@router.post("/{run_id}/export")
def export_trainset(run_id: str):
    """
    Eksporter kuraterte (keep=True) funn til:
      - trainset.csv (kolonner: text,label,gruppe,kravtype,short_text,keep)
      - trainset.json (samme data som JSON)
    """
    items = _load_items(run_id)

    # behold kun rader som kan brukes i trening
    kept = [
        it for it in items
        if it.get("keep", True) and (it.get("label") or it.get("gruppe") or it.get("kravtype"))
    ]
    if not kept:
        raise HTTPException(status_code=400, detail="Ingen elementer markert som keep=True")

    out_rows = []
    for it in kept:
        out_rows.append({
            "text": it.get("text", ""),
            # label: manuelt satt label → gruppe → kravtype
            "label": (it.get("label") or it.get("gruppe") or it.get("kravtype") or "").strip(),
            "gruppe": it.get("gruppe", "Uspesifisert"),
            "kravtype": it.get("kravtype", ""),
            "short_text": it.get("short_text", ""),
            "keep": bool(it.get("keep", True)),
        })

    run_dir = _run_dir(run_id)
    csv_path = run_dir / "trainset.csv"
    json_path = run_dir / "trainset.json"

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["text", "label", "gruppe", "kravtype", "short_text", "keep"]
        )
        w.writeheader()
        w.writerows(out_rows)

    json_path.write_text(
        json.dumps(out_rows, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    return {"ok": True, "export": {"csv": csv_path.name, "json": json_path.name, "count": len(out_rows)}}
