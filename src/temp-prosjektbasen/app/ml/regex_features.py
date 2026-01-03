# app/ml/regex_features.py
# -*- coding: utf-8 -*-
import re
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

# Flytt REGEX_MAP hit også for at treningen og lastingen deler samme kilde
REGEX_MAP = {
    "ventilasjon": [
        r"\bns[-\s]?en\s*12599\b", r"\bsfp\b", r"\bahu\b", r"varmegjenvinner",
        r"\bfilter\b", r"\bkanal", r"\bluft", r"\bvav\b", r"\bco ?2|co₂",
        r"\blydfell", r"\bavkast\b", r"\binntak\b"
    ],
    "elektro": [
        r"\bnek\s*400\b", r"\b(spd|overspenningsvern)\b", r"\b(rcd|jordfeil)\b",
        r"\btavle\b", r"\bstikkontakt\b", r"\bdali\b", r"\bip ?44\b", r"\bkabelbro\b",
        r"\btermograf"
    ],
    "byggautomasjon": [
        r"\bbacnet\b", r"\bmodbus\b", r"\bsd[- ]?anlegg|sd-?anlegg|scada|bas\b",
        r"\btrend", r"\balarm", r"\btag\b", r"\bio-?liste", r"\bwebgrensesnitt\b", r"\bvpn\b"
    ],
    "rørlegger": [
        r"\bsprinkler\b", r"\btappevann\b", r"\bsluk\b", r"\bfettutskiller\b",
        r"\bvarmesentral\b", r"trykkprøv", r"\bkobberrør\b", r"legionella",
        r"ekspansjonskar|expansjonskar", r"sikkerhetsventil"
    ],
    "kulde": [
        r"\bf-?gass\b", r"kuldemed", r"\bkondensator\b", r"\bisvann\b", r"\bkompressor\b",
        r"\bdx\b", r"\bseer\b|\bscop\b", r"\bfordamper\b", r"\blekkasjevakt\b"
    ],
    "totalentreprenør": [
        r"\bfdv\b", r"\bgaranti\b", r"\beop\b|energioppfølgingsplan",
        r"\bfremdrift\b", r"\bsha\b", r"\bopplæring\b", r"\boverlevering\b",
        r"kildesortering", r"universell utforming", r"byggemøte"
    ],
    "prosjektering": [
        r"\bns\s*3935\b", r"\biso\s*19650\b", r"\bbim\b",
        r"\bbep\b|\bbim execution plan\b", r"\bifc(?:2x3|4)?\b", r"\bbcf\b",
        r"\bkollisjonskontroll\b|\bclash\b", r"\btverrfaglig\b|\bkoordineringsmodell\b",
        r"\blod\b|\bloi\b", r"\bromprogram\b|\barealprogram\b|\bromskjema\b",
        r"\bas[- ]?built\b|\bsom bygget\b", r"\bleveranseplan\b|\bmodellmanual\b",
        r"\bkontrollplan\b|\buavhengig kontroll\b|\bsak\s*10\b|\btek\s*17\b",
        r"\bmengdeuttak\b|\bmengdeliste\b|\bdwg\b|\bpdf\b|\bifc\b"
    ],
}

class RegexCounts(BaseEstimator, TransformerMixin):
    def __init__(self, regex_map=REGEX_MAP):
        self.regex_map = regex_map
        self.patterns_ = []
        self.feature_names_ = []

    def fit(self, X, y=None):
        self.patterns_.clear()
        self.feature_names_.clear()
        for cls, pats in self.regex_map.items():
            for i, p in enumerate(pats):
                self.patterns_.append(re.compile(p, flags=re.I))
                self.feature_names_.append(f"rx__{cls}__{i}")
        return self

    def transform(self, X):
        M = np.zeros((len(X), len(self.patterns_)), dtype=float)
        for i, text in enumerate(X):
            s = str(text)
            for j, pat in enumerate(self.patterns_):
                M[i, j] = min(len(pat.findall(s)), 3.0)
        return M
