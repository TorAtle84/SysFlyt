# predict_to_csv.py
import joblib, pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

KRAV_FILE = "krav.txt"
ISREQ_PKL = "out/krav_validator.pkl"
FAG_PKL   = "out/fag_profiler.pkl"
OUT_CSV   = "out/krav_med_domener.csv"

isreq = joblib.load(ISREQ_PKL)
fag   = joblib.load(FAG_PKL)  # {'classes','matrix','vectorizer'}

rows = []
with open(KRAV_FILE, encoding="utf-8") as f:
    for ln in f:
        t = ln.strip()
        if not t: continue
        p = float(isreq.predict_proba([t])[0][1])

        v = fag["vectorizer"].transform([t])
        sims = cosine_similarity(v, fag["matrix"]).ravel()
        order = sims.argsort()[::-1]
        top = [(fag["classes"][i], float(sims[i])) for i in order[:3]]

        rows.append({
            "Krav": t,
            "is_requirement_prob": round(p, 3),
            "Top1_fag": top[0][0], "Top1_sim": round(top[0][1], 3),
            "Top2_fag": top[1][0], "Top2_sim": round(top[1][1], 3),
            "Top3_fag": top[2][0], "Top3_sim": round(top[2][1], 3),
            # valgfritt: enkel terskel for å “låse” domene
            "Endelig_domeneforslag": top[0][0] if top[0][1] >= 0.12 else "Tverrfaglig/Uklar"
        })

df = pd.DataFrame(rows)
df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
print(f"[OK] Skrev {OUT_CSV} ({len(df)} linjer)")
