"""
Sprint 3 — Data Preprocessing Pipeline (CICIDS2017 edition)
Steps: Clean → Feature-select → Normalise (MinMaxScaler)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
import joblib

from ml.load_cicids import FEATURE_COLS

ARTIFACTS_PATH = os.path.join(os.path.dirname(__file__), "artifacts")

# Heavy-tailed features (spans of 6+ orders of magnitude). Without a log
# transform, MinMaxScaler squashes 99% of their values into a sliver near 0
# and the IsolationForest can no longer split meaningfully on them.
# Packet-length means and Init_Win bytes are bounded (MTU / 65535) and are
# left linear.
LOG_FEATURES = [
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Total Length of Fwd Packets",
    "Total Length of Bwd Packets",
    "Flow Bytes/s",
    "Flow Packets/s",
    "Flow IAT Mean",
    "FIN Flag Count",
    "SYN Flag Count",
    "RST Flag Count",
    "PSH Flag Count",
    "ACK Flag Count",
]


# ── Step 1: Clean ─────────────────────────────────────────────────────────────
def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.dropna(subset=FEATURE_COLS, inplace=True)
    df.drop_duplicates(inplace=True)
    for col in FEATURE_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df.dropna(subset=FEATURE_COLS, inplace=True)
    return df.reset_index(drop=True)


# ── Step 2: Log-transform heavy-tailed features ───────────────────────────────
def log_transform(df: pd.DataFrame) -> pd.DataFrame:
    """Returns a copy — callers keep the raw values for reporting."""
    df = df.copy()
    for col in LOG_FEATURES:
        if col in df.columns:
            # clip: Init_Win-style sentinels (-1) and any negatives -> 0
            df[col] = np.log1p(df[col].clip(lower=0))
    return df


# ── Step 3: Extract feature matrix ────────────────────────────────────────────
def get_feature_matrix(df: pd.DataFrame):
    available = [c for c in FEATURE_COLS if c in df.columns]
    return df[available].values, available


# ── Step 4: Normalise ──────────────────────────────────────────────────────────
def scale(X: np.ndarray, fit: bool = True, scaler=None):
    if fit:
        scaler = MinMaxScaler()
        return scaler.fit_transform(X), scaler
    return scaler.transform(X), scaler


# ── Combined pipeline ──────────────────────────────────────────────────────────
def preprocess(df: pd.DataFrame, fit: bool = True, scaler=None):
    df_clean = clean(df)
    # log_transform works on a copy: df_clean keeps raw values because
    # detect() reads bytes/duration from it for the dashboard records.
    X, feature_names = get_feature_matrix(log_transform(df_clean))
    X_scaled, scaler = scale(X, fit=fit, scaler=scaler)
    return X_scaled, df_clean, scaler, feature_names


# ── Persistence helpers ────────────────────────────────────────────────────────
def save_scaler(scaler, path: str = ARTIFACTS_PATH):
    os.makedirs(path, exist_ok=True)
    joblib.dump(scaler, os.path.join(path, "scaler.pkl"))
    print(f"Scaler saved -> {path}/scaler.pkl")


def load_scaler(path: str = ARTIFACTS_PATH):
    return joblib.load(os.path.join(path, "scaler.pkl"))


if __name__ == "__main__":
    from ml.load_cicids import load_all
    df = load_all()
    X, df_clean, scaler, features = preprocess(df)
    save_scaler(scaler)
    print(f"Preprocessed shape : {X.shape}")
    print(f"Features           : {features}")
