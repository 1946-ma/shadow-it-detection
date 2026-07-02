"""
Sprint 4 — Isolation Forest Model (CICIDS2017 edition)
Train : python ml/model.py
Detect: from ml.model import detect
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

from ml.load_cicids import FEATURE_COLS, load_all
from ml.preprocess  import preprocess, save_scaler, load_scaler

ARTIFACTS  = os.path.join(os.path.dirname(__file__), "artifacts")
MODEL_PATH = os.path.join(ARTIFACTS, "isolation_forest.pkl")


# ── Risk classification ────────────────────────────────────────────────────────
# Thresholds are empirical tertiles of this model's actual anomaly_score
# distribution on flagged (pred == -1) records — NOT the theoretical
# score_samples() range of [-0.5, 0]. In practice, with contamination=0.27,
# every flagged record already scores well below -0.33, so a fixed -0.33/-0.17
# split put 100% of detections in "high" (medium/low were unreachable).
# Measured from 10,253 real detections: p33=-0.5033, p66=-0.4544, range
# [-0.7903, -0.4212]. Recalibrate these two constants (e.g. via
# `SELECT percentile_cont(0.33/0.66) WITHIN GROUP (ORDER BY anomaly_score)
# FROM detections`) if the model is retrained and the score range shifts.
RISK_THRESHOLD_HIGH   = -0.50   # score < -0.50                     → high   (bottom third)
RISK_THRESHOLD_MEDIUM = -0.45   # -0.50 <= score < -0.45           → medium (middle third)
                                 # score >= -0.45                   → low    (top third)


def classify_risk(score: float, shadow_type: str) -> str:
    if score < RISK_THRESHOLD_HIGH:
        return "high"
    if score < RISK_THRESHOLD_MEDIUM:
        return "medium"
    return "low"


def _infer_type(row: dict) -> str:
    """Infer Shadow IT type from traffic features when no label is available."""
    syn  = float(row.get("SYN Flag Count", 0))
    rst  = float(row.get("RST Flag Count", 0))
    pkts = float(row.get("Flow Packets/s", 0))
    bps  = float(row.get("Flow Bytes/s",   0))

    if syn > 5 or rst > 5 or pkts > 10000:
        return "hardware"   # scan / DoS pattern
    if bps > 50000:
        return "mixed"
    return "software"


# ── Training ───────────────────────────────────────────────────────────────────
def train(
    df: pd.DataFrame = None,
    n_estimators: int    = 200,
    contamination: float = 0.27,
    max_samples: int     = 512,
):
    if df is None:
        print("Loading CICIDS2017 data …")
        df = load_all()

    X, df_clean, scaler, features = preprocess(df, fit=True)

    model = IsolationForest(
        n_estimators  = n_estimators,
        contamination = contamination,
        max_samples   = max_samples,
        random_state  = 42,
        n_jobs        = -1,
    )
    print(f"Training Isolation Forest on {X.shape[0]:,} records, {X.shape[1]} features …")
    model.fit(X)

    os.makedirs(ARTIFACTS, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    save_scaler(scaler)

    print(f"Model saved → {MODEL_PATH}")
    return model, scaler


def load_model():
    return joblib.load(MODEL_PATH)


# ── Inference ──────────────────────────────────────────────────────────────────
def detect(records):
    """
    Parameters
    ----------
    records : list[dict] | pd.DataFrame
        Must contain the CICIDS feature columns (or as many as available).

    Returns
    -------
    (results: list[dict], elapsed_seconds: float)
    """
    t0 = time.time()

    df = pd.DataFrame(records) if isinstance(records, list) else records.copy()
    model  = load_model()
    scaler = load_scaler()

    X, df_clean, _, _ = preprocess(df, fit=False, scaler=scaler)

    preds  = model.predict(X)
    scores = model.score_samples(X)

    results = []
    for i, (pred, score) in enumerate(zip(preds, scores)):
        if pred == -1:
            row   = df_clean.iloc[i].to_dict()
            stype = row.get("shadow_it_type") or _infer_type(row)
            if stype == "none":
                stype = _infer_type(row)
            risk  = classify_risk(score, stype)

            results.append({
                "src_ip":         str(row.get("Source IP",         "0.0.0.0")),
                "src_mac":        str(row.get("src_mac",           "Unknown")),
                "dst_domain":     str(row.get("Destination IP",    "Unknown")),
                "protocol":       _proto_name(row.get("Protocol",  6)),
                "bytes_sent":     int(float(row.get("Total Length of Fwd Packets", 0))),
                "bytes_received": int(float(row.get("Total Length of Bwd Packets", 0))),
                "duration":       round(float(row.get("Flow Duration", 0)) / 1_000_000, 4),
                "device_type":    str(row.get("device_type", "unknown")),
                "shadow_it_type": stype,
                "risk_level":     risk,
                "anomaly_score":  float(score),
            })

    elapsed = time.time() - t0
    print(f"detect(): {len(results)} anomalies / {len(df_clean)} records in {elapsed:.3f}s")
    return results, elapsed


def _proto_name(proto) -> str:
    mapping = {6: "TCP", 17: "UDP", 1: "ICMP", 0: "HOPOPT"}
    try:
        return mapping.get(int(float(proto)), str(proto))
    except (ValueError, TypeError):
        return str(proto)


if __name__ == "__main__":
    train()
    print("\nTraining complete. Run ml/evaluate.py to benchmark.")
