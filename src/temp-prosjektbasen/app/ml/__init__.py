# app/ml/__init__.py
# -*- coding: utf-8 -*-
"""ML helpers package."""

# (valgfritt) Eksponer vanlige symboler – nyttig for pickles som forventer disse i app.ml
try:
    from .text_utils import normalize_text  # noqa: F401
except Exception:
    pass

try:
    from .regex_features import RegexCounts  # noqa: F401
except Exception:
    pass

__all__ = [name for name in ("normalize_text", "RegexCounts") if name in globals()]
