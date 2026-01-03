# app/data/train_validator.py
# train_validator.py
import argparse
from pathlib import Path
import warnings
import joblib
import pandas as pd
from pandas.errors import ParserError
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

def read_lines(path: Path):
    """Leser linjer fra en fil og fjerner tomme linjer. Returnerer None hvis fila mangler."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return [ln.strip() for ln in f if ln.strip()]
    except FileNotFoundError:
        print(f"❌ FEIL: Finner ikke filen '{path}'.")
        return None

def sniff_sep(sample: str) -> str | None:
    """Enkel sniff av separator i en liten tekstprøve."""
    for cand in (";", ",", "\t", "|"):
        if cand in sample:
            return cand
    return None

def read_krav_from_csv(csv_path: Path, text_col=None, sep: str | None = None):
    """
    Leser positive eksempler (krav) fra krav_med_domener.csv.
    - text_col:
        * None  -> bruk første kolonne (A)
        * str   -> kolonnenavn
        * int   -> 0-basert kolonneindeks
    - sep:
        * None  -> forsøk å autodetektere separator
        * str   -> eksplisitt separator (f.eks. ';' eller ',')
    """
    if not csv_path.exists():
        print(f"❌ FEIL: Finner ikke CSV-filen '{csv_path}'.")
        return None

    # Les en liten prøvdel for sniff
    raw_head = ""
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            for _ in range(5):
                try:
                    raw_head += next(f)
                except StopIteration:
                    break
    except Exception:
        pass

    use_sep = sep or sniff_sep(raw_head)

    def _try_read(encoding: str):
        # engine='python' tåler variasjoner og on_bad_lines
        return pd.read_csv(
            csv_path,
            encoding=encoding,
            sep=use_sep,
            engine="python",
            dtype=str,
            on_bad_lines="skip",
            quotechar='"'
        )

    # Prøv robust lesing
    try:
        df = _try_read("utf-8")
    except UnicodeDecodeError:
        df = _try_read("latin1")
    except ParserError:
        try:
            df = _try_read("utf-8")
        except Exception:
            df = _try_read("latin1")

    if df is None or df.empty:
        print("❌ FEIL: CSV-fil er tom eller kunne ikke leses.")
        return None

    # Velg kolonne med tekst
    if text_col is None:
        series = df.iloc[:, 0]  # Første kolonne (A)
    elif isinstance(text_col, int):
        if text_col < 0 or text_col >= df.shape[1]:
            print(f"❌ FEIL: text_col={text_col} er utenfor kolonneindeksene (0..{df.shape[1]-1}).")
            return None
        series = df.iloc[:, text_col]
    else:
        if text_col not in df.columns:
            print(f"❌ FEIL: Kolonnen '{text_col}' finnes ikke i CSV: {list(df.columns)}")
            return None
        series = df[text_col]

    krav = [str(x).strip() for x in series.dropna().tolist() if str(x).strip()]
    if not krav:
        print("❌ FEIL: Fant ingen ikke-tomme tekster i valgt kolonne i CSV.")
        return None

    # Fjern duplikater
    krav = sorted(set(krav))
    return krav

def main():
    warnings.filterwarnings("ignore", category=UserWarning)

    p = argparse.ArgumentParser(description="Tren krav-validator (ja/nei) fra CSV + ikke_krav.txt.")
    p.add_argument("--csv-file", default="krav_med_domener.csv",
                   help="CSV med krav i kolonne A (fra linje 2 pga header).")
    p.add_argument("--csv-text-col", default=None,
                   help="Kolonnen med krav-tekst: None=første kolonne (A), ellers kolonnenavn eller 0-basert indeks.")
    p.add_argument("--sep", default=None,
                   help="Separator for CSV (f.eks. ';', ',', '\\t'). Hvis utelatt, forsøkes autodeteksjon.")
    p.add_argument("--ikke-krav", default="ikke_krav.txt",
                   help="Fil med ikke-krav (én pr linje).")
    p.add_argument("--out-file", default="krav_validator.pkl",
                   help="Navn på den ferdig trente modellfilen.")
    p.add_argument("--test-size", type=float, default=0.2,
                   help="Andel som brukes til test (default 0.2).")
    args = p.parse_args()

    # Tolk csv-text-col: int hvis mulig
    text_col = args.csv_text_col
    if isinstance(text_col, str):
        try:
            text_col = int(text_col)
        except ValueError:
            pass  # behold som str (kolonnenavn)

    # --- Last inn positive (krav) fra CSV ---
    krav = read_krav_from_csv(Path(args.csv_file), text_col=text_col, sep=args.sep)
    if krav is None:
        return

    # --- Last inn negative (ikke-krav) ---
    ikke = read_lines(Path(args.ikke_krav))
    # BUGFIX: Avslutt bare hvis fila IKKE ble lest
    if ikke is None:
        print("❌ FEIL: Kunne ikke lese 'ikke_krav.txt', avslutter.")
        return

    # Fortsett hvis filen ble lest, og fjern duplikater
    ikke = sorted(set(ikke))

    if len(krav) == 0 or len(ikke) == 0:
        print("❌ FEIL: Tomme treningsdata. Sørg for at både CSV (krav) og ikke_krav.txt har innhold.")
        return

    print(f"📊 Treningsgrunnlag: {len(krav)} krav + {len(ikke)} ikke-krav (etter deduplisering).")

    # --- DataFrame ---
    df = pd.concat([
        pd.DataFrame({"text": krav, "label": 1}),
        pd.DataFrame({"text": ikke, "label": 0}),
    ], ignore_index=True)

    if df["label"].nunique() < 2:
        print("❌ FEIL: Bare én klasse funnet. Sørg for at ikke_krav.txt inneholder linjer.")
        return

    # --- Train/test split ---
    X_train, X_test, y_train, y_test = train_test_split(
        df["text"], df["label"],
        test_size=args.test_size,
        random_state=42,
        stratify=df["label"]
    )

    # --- Modell ---
    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 3),
            min_df=1,
            max_df=0.95,
            sublinear_tf=True
        )),
        ("clf", LogisticRegression(
            max_iter=400,
            random_state=42,
            solver="liblinear",
            class_weight="balanced"
        )),
    ])

    print("🚀 Starter trening av krav-validator ('Portvakten')...")
    pipe.fit(X_train, y_train)

    acc = pipe.score(X_test, y_test)
    joblib.dump(pipe, args.out_file)
    print(f"✅ [OK] Lagret krav-validator til: {args.out_file} (nøyaktighet ~ {acc:.2f})")

if __name__ == "__main__":
    main()
