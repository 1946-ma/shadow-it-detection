"""
Behavioural traffic classifier — predicts an app *category* from a flow's
behavioural statistics (added 2026-07-29, roadmap: ML traffic-classification).

Complements the SaaS catalog: the catalog names a destination only when a
hostname (TLS SNI / DNS) can be extracted and matched. This model instead
learns each category's *behavioural shape* (durations, packet/byte counts and
rates, packet-length distribution, TCP flags, init-window) so an
**anomaly-flagged** flow that couldn't be named can still be characterised —
"this behaves like file-sharing / remote-access" — the "look-alike" signal.

Design (per the approved plan):
  - Training data is SELF-RECORDED during live capture: every flow `detect()`
    can name via the catalog appends one labelled sample here
    (`record_training_sample`), plus sanctioned-baseline flows as `benign`.
    In the bank-net deployment those are exactly the testbed's flows.
  - `train()` fits a RandomForest on the accumulated samples and reports a
    holdout accuracy; `build_traffic_dataset.py` / the retrain API call it.
  - `classify()` is applied ONLY to anomaly-flagged flows in `detect()`, and
    only fills the otherwise-empty `app_category` when confident.

Everything degrades to a no-op if the artifact is missing — exactly like the
optional RandomForest stage in `model.py` (`load_rf()`).
"""
import os
import csv
import json
import time

import numpy as np
import joblib

ARTIFACTS   = os.path.join(os.path.dirname(__file__), "artifacts")
DATA_DIR    = os.path.join(os.path.dirname(__file__), "data")
MODEL_PATH  = os.path.join(ARTIFACTS, "traffic_classifier.pkl")
META_PATH   = os.path.join(ARTIFACTS, "traffic_classifier_meta.json")
SAMPLES_CSV = os.path.join(DATA_DIR, "traffic_samples.csv")

# Numeric behavioural features — the subset of FlowRecord.to_feature_dict()
# (ml/collector.py) the model reads. Order is fixed and used both when
# recording samples and when classifying, so training and inference align.
FEATURE_COLS = [
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Total Length of Fwd Packets",
    "Total Length of Bwd Packets",
    "Flow Bytes/s",
    "Flow Packets/s",
    "Fwd Packet Length Mean",
    "Bwd Packet Length Mean",
    "Flow IAT Mean",
    "Packet Length Mean",
    "Packet Length Std",
    "FIN Flag Count",
    "SYN Flag Count",
    "RST Flag Count",
    "PSH Flag Count",
    "ACK Flag Count",
    "Average Packet Size",
    "Init_Win_bytes_forward",
    "Init_Win_bytes_backward",
]

BENIGN_LABEL   = "benign"
MIN_CONFIDENCE = float(os.getenv("TRAFFIC_CLASS_MIN_CONFIDENCE", "0.6"))
_SAMPLE_CAP    = int(os.getenv("TRAFFIC_CLASS_SAMPLE_CAP", "40000"))

# Cached model, (re)loaded lazily. reload_classifier() clears it after a retrain.
_clf = None
_clf_loaded = False


def _feature_vector(row: dict) -> list[float]:
    """Extract FEATURE_COLS from a flow row as clean floats (inf/nan → 0)."""
    vec = []
    for col in FEATURE_COLS:
        try:
            v = float(row.get(col, 0.0))
        except (TypeError, ValueError):
            v = 0.0
        if not np.isfinite(v):
            v = 0.0
        vec.append(v)
    return vec


# ── Sample recording (grows the training store during live capture) ─────────────
def record_training_sample(row: dict, category: str) -> None:
    """Append one labelled behavioural sample. Best-effort: never raises into
    the capture loop. Skips empty/unknown categories."""
    if not category or not isinstance(category, str):
        return
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        new_file = not os.path.exists(SAMPLES_CSV)
        with open(SAMPLES_CSV, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new_file:
                w.writerow(FEATURE_COLS + ["category"])
            w.writerow(_feature_vector(row) + [category])
    except Exception:
        # Recording is non-essential; a full disk / locked file must not break
        # live detection.
        return


def _trim_samples() -> None:
    """Keep the sample store bounded (last _SAMPLE_CAP rows). Best-effort."""
    try:
        if not os.path.exists(SAMPLES_CSV):
            return
        with open(SAMPLES_CSV, encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) - 1 <= _SAMPLE_CAP:
            return
        header, body = lines[0], lines[1:]
        body = body[-_SAMPLE_CAP:]
        with open(SAMPLES_CSV, "w", encoding="utf-8") as f:
            f.writelines([header] + body)
    except Exception:
        return


# ── Inference ───────────────────────────────────────────────────────────────────
def load_classifier():
    """Cached load of the trained classifier, or None if not trained yet."""
    global _clf, _clf_loaded
    if _clf_loaded:
        return _clf
    _clf_loaded = True
    try:
        _clf = joblib.load(MODEL_PATH) if os.path.exists(MODEL_PATH) else None
    except Exception:
        _clf = None
    return _clf


def reload_classifier():
    """Drop the cache so the next load_classifier() re-reads from disk (call
    after a retrain so a long-running backend picks up the new model)."""
    global _clf, _clf_loaded
    _clf, _clf_loaded = None, False


def classify(row: dict) -> tuple[str | None, float]:
    """Predict (category, confidence) for a flow row. Returns (None, 0.0) if no
    model is loaded or anything goes wrong — a strict no-op fallback."""
    clf = load_classifier()
    if clf is None:
        return None, 0.0
    try:
        X = np.array([_feature_vector(row)], dtype=float)
        proba = clf.predict_proba(X)[0]
        idx = int(np.argmax(proba))
        return str(clf.classes_[idx]), float(proba[idx])
    except Exception:
        return None, 0.0


# ── Training ─────────────────────────────────────────────────────────────────────
def train(samples_csv: str = SAMPLES_CSV) -> dict:
    """Fit a RandomForest on the accumulated samples; save artifact + meta.

    Returns a summary dict (also written to META_PATH). Raises ValueError with a
    clear message when there isn't enough labelled data yet."""
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score

    if not os.path.exists(samples_csv):
        raise ValueError(
            f"No training samples yet ({samples_csv}). Run a bank-net live scan so "
            f"detect() records named/benign flows, then retrain."
        )

    df = pd.read_csv(samples_csv)
    df = df.replace([np.inf, -np.inf], 0.0).fillna(0.0)
    df = df[df["category"].astype(str).str.len() > 0]

    counts = df["category"].value_counts()
    # Need ≥2 classes and enough rows per class for a meaningful split.
    usable = counts[counts >= 4]
    if len(usable) < 2:
        raise ValueError(
            f"Not enough labelled data to train: need ≥2 categories with ≥4 samples "
            f"each, have {dict(counts)}. Capture more bank-net traffic first."
        )
    df = df[df["category"].isin(usable.index)]

    X = df[FEATURE_COLS].astype(float).values
    y = df["category"].astype(str).values

    # Stratified holdout for an honest accuracy figure.
    try:
        X_tr, X_te, y_tr, y_te = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=y
        )
    except ValueError:
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42)

    clf = RandomForestClassifier(
        n_estimators=200, class_weight="balanced", random_state=42, n_jobs=-1
    )
    clf.fit(X_tr, y_tr)
    acc = float(accuracy_score(y_te, clf.predict(X_te)))

    os.makedirs(ARTIFACTS, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)

    meta = {
        "trained": True,
        "categories": sorted(usable.index.tolist()),
        "n_samples": int(len(df)),
        "per_category": {k: int(v) for k, v in usable.items()},
        "accuracy": round(acc, 4),
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    _trim_samples()
    reload_classifier()
    return meta


def load_meta() -> dict:
    """Read the last-training summary for the status endpoint. Never raises."""
    try:
        if os.path.exists(META_PATH):
            with open(META_PATH, encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    n = 0
    try:
        if os.path.exists(SAMPLES_CSV):
            with open(SAMPLES_CSV, encoding="utf-8") as f:
                n = max(0, sum(1 for _ in f) - 1)
    except Exception:
        n = 0
    return {"trained": False, "categories": [], "n_samples": n,
            "accuracy": None, "trained_at": None}


if __name__ == "__main__":
    print(json.dumps(train(), indent=2))
