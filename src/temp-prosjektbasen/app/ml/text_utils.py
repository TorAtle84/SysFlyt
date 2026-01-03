# app/ml/text_utils.py
# -*- coding: utf-8 -*-
"""Tekstverktøy (rensing/normalisering) brukt på tvers av appen."""
from __future__ import annotations
import re
import unicodedata

_WS_RE = re.compile(r"\s+")

def normalize_text(text: str) -> str:
    """
    Lettvekts-normalisering for klassifisering/vektorisering:
    - Unicode NFKC
    - Lowercase
    - Trimmer og komprimerer whitespace
    - Erstatter norske spesialtegn konsistent
    """
    if text is None:
        return ""
    t = str(text)
    t = unicodedata.normalize("NFKC", t)
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    t = t.lower()
    t = t.replace("ø", "ø").replace("æ", "æ").replace("å", "å")  # bevar norske tegn
    t = _WS_RE.sub(" ", t).strip()
    return t
