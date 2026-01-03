# -*- coding: utf-8 -*-
"""
Røyktest for fag-modellen. Kjører etter trening / ved oppstart.
Bruk:
  python -m app.tests.fag_smoketest
Exit code != 0 ved feil.
"""
from __future__ import annotations
import sys
from pathlib import Path

from app.tasks.models import reload_fag_model, PKL_FAG_PROFILER
from app.ml.text_utils import normalize_text

SAMPLES = [
    "Det etableres låsbare servicebrytere foran alt utstyr med elektrisk tilkobling som har skadepotensiale ved drift- og vedlikeholdsaktiviteter.",
    "VAV-spjeld skal innreguleres i henhold til prosjektert luftmengde.",
    "Alle pumper skal leveres med vibrasjonsdempere og servicekraner.",
    "SD-anlegget skal logge alle alarmer og hendelser for senere analyse."
]

def main() -> int:
    mdl = reload_fag_model()
    if not isinstance(mdl, dict) or "pipeline" not in mdl or "labels" not in mdl:
        print(f"[FEIL] Fagmodell kunne ikke lastes fra: {Path(PKL_FAG_PROFILER).resolve()}")
        return 2

    pipe = mdl["pipeline"]
    labels = mdl["labels"]

    failures = 0
    for i, txt in enumerate(SAMPLES, 1):
        x = normalize_text(txt)
        try:
            y_idx = pipe.predict([x])[0]
            if isinstance(y_idx, (int,)):
                y = labels[y_idx] if 0 <= y_idx < len(labels) else str(y_idx)
            else:
                y = str(y_idx)
        except Exception as e:
            print(f"[FEIL] Prediksjon feilet for prøve {i}: {e}")
            failures += 1
            continue

        print(f"[OK] Prøve {i}: «{txt[:80]}...» → {y}")
        if str(y).strip().lower() == "uspesifisert":
            print(f"[AVVIK] Prøve {i} ble klassifisert som 'Uspesifisert'.")
            failures += 1

    if failures:
        print(f"[FEIL] {failures} av {len(SAMPLES)} prøver feilet krav (ikke-‘Uspesifisert’).")
        return 1

    print("[OK] Alle prøver ble klassifisert til et fag ≠ 'Uspesifisert'.")
    return 0

if __name__ == "__main__":
    sys.exit(main())