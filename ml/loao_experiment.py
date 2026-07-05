"""
Leave-one-attack-out (LOAO) experiment — novel-threat coverage evidence.
Run from shadow-it-detection/ : python ml/loao_experiment.py

For each attack family F:
  - The RandomForest is retrained on the 70% train partition with ALL rows of
    F removed, so it has never seen this attack type.
  - The production IsolationForest is reused unchanged: it trains on benign
    traffic only, so every attack is 'novel' to it by construction.
  - On the 30% holdout rows belonging to F, recall is measured for: the
    blinded RF, the IF gate, and the hybrid (RF OR IF).
  - Baseline column: recall of the full RF (trained with F) for comparison.

Requires trained artifacts (run ml/model.py first). The production model is
never modified — the blinded RFs are throwaway.
Results -> ml/reports/loao_results.csv
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from ml.load_cicids import load_all, train_mask
from ml.preprocess import preprocess, load_scaler
from ml.model import load_model

REPORTS = os.path.join(os.path.dirname(__file__), "reports")

FAMILIES = {
    "DDoS":         ["DDoS"],
    "PortScan":     ["PortScan"],
    "DoS":          ["DoS Hulk", "DoS GoldenEye", "DoS slowloris", "DoS Slowhttptest"],
    "Brute-force":  ["FTP-Patator", "SSH-Patator"],
    "Web Attacks":  ["Web Attack \x96 Brute Force", "Web Attack \x96 XSS",
                     "Web Attack \x96 Sql Injection", "Web Attack – Brute Force",
                     "Web Attack – XSS", "Web Attack – Sql Injection"],
    "Bot":          ["Bot"],
    "Infiltration": ["Infiltration"],
    "Heartbleed":   ["Heartbleed"],
}


def run():
    print("Loading data (same sampling as training run) ...")
    df   = load_all()                  # 30k/file, matches ml/model.py train()
    mask = train_mask(df)
    model, scaler = load_model(), load_scaler()

    X_tr, df_tr, _, _ = preprocess(df[mask],  fit=False, scaler=scaler)
    X_ho, df_ho, _, _ = preprocess(df[~mask], fit=False, scaler=scaler)
    y_tr = df_tr["shadow_it_label"].values
    lab_tr, lab_ho = df_tr["Label"].values, df_ho["Label"].values

    if_flag_ho = model.predict(X_ho) == -1
    print(f"Train {len(y_tr):,} rows / holdout {len(lab_ho):,} rows")
    print(f"IF gate offset: {model.offset_:.4f}\n")

    # Baseline RF trained on everything (mirrors production)
    rf_full = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    rf_full.fit(X_tr, y_tr)
    rf_full_ho = rf_full.predict(X_ho) == 1

    rows = []
    hdr = (f"{'Family':<13} {'n(hold)':>7} {'RF full':>8} {'RF blind':>9} "
           f"{'IF gate':>8} {'Hybrid':>8}")
    print(hdr); print("-" * len(hdr))
    for fam, labels in FAMILIES.items():
        fam_ho = np.isin(lab_ho, labels)
        n = int(fam_ho.sum())
        if n == 0:
            print(f"{fam:<13} {'0':>7}  (not present in holdout — skipped)")
            continue

        keep = ~np.isin(lab_tr, labels)      # drop family from RF training
        rf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
        rf.fit(X_tr[keep], y_tr[keep])
        rf_blind_ho = rf.predict(X_ho) == 1

        r_full   = rf_full_ho[fam_ho].mean()
        r_blind  = rf_blind_ho[fam_ho].mean()
        r_if     = if_flag_ho[fam_ho].mean()
        r_hybrid = (rf_blind_ho | if_flag_ho)[fam_ho].mean()
        print(f"{fam:<13} {n:>7,} {r_full:>8.1%} {r_blind:>9.1%} {r_if:>8.1%} {r_hybrid:>8.1%}")
        rows.append(dict(family=fam, holdout_rows=n,
                         rf_full_recall=round(float(r_full), 4),
                         rf_blind_recall=round(float(r_blind), 4),
                         if_gate_recall=round(float(r_if), 4),
                         hybrid_blind_recall=round(float(r_hybrid), 4)))

    os.makedirs(REPORTS, exist_ok=True)
    out = os.path.join(REPORTS, "loao_results.csv")
    pd.DataFrame(rows).to_csv(out, index=False)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    run()
