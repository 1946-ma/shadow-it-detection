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
from sklearn.ensemble import IsolationForest, RandomForestClassifier
import joblib

from ml.load_cicids import FEATURE_COLS, load_all, train_mask
from ml.preprocess  import preprocess, save_scaler, load_scaler
from ml.oui         import vendor_from_mac

ARTIFACTS      = os.path.join(os.path.dirname(__file__), "artifacts")
MODEL_PATH     = os.path.join(ARTIFACTS, "isolation_forest.pkl")
RF_PATH        = os.path.join(ARTIFACTS, "random_forest.pkl")
ALLOWLIST_PATH = os.path.join(os.path.dirname(__file__), "sanctioned_services.txt")
CATALOG_PATH   = os.path.join(os.path.dirname(__file__), "saas_catalog.csv")


# ── Sanctioned-services allowlist ──────────────────────────────────────────────
def load_allowlist(path: str = ALLOWLIST_PATH) -> set[str]:
    """Sanctioned service domains, lowercased. Empty set if no file."""
    if not os.path.exists(path):
        return set()
    entries = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            entry = line.split("#", 1)[0].strip().lower()
            if entry:
                entries.add(entry)
    return entries


def is_sanctioned(host: str, allowlist: set[str]) -> bool:
    """True if host matches an allowlist entry exactly or as a subdomain.
    Only meaningful for real hostnames — raw IPs won't match domain entries."""
    if not allowlist or not host:
        return False
    host = host.lower().rstrip(".")
    return any(host == e or host.endswith("." + e) for e in allowlist)


# ── Shadow IT SaaS catalog ─────────────────────────────────────────────────────
# Known cloud apps → (app_name, category, risk). Matching an UNSANCTIONED entry
# flags a flow as Shadow IT regardless of the ML anomaly score — the signal the
# anomaly model can't provide, because unauthorised-app traffic looks normal.
_CATALOG_RISK = {"high", "medium", "low"}


def load_saas_catalog(path: str = CATALOG_PATH) -> dict[str, dict]:
    """domain → {app_name, category, risk}, lowercased keys. Empty if no file."""
    catalog: dict[str, dict] = {}
    if not os.path.exists(path):
        return catalog
    import csv
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.lstrip().startswith("#") or not line.strip():
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 4 or parts[0].lower() == "domain":
                continue
            domain, app_name, category, risk = parts[0], parts[1], parts[2], parts[3].lower()
            if domain and risk in _CATALOG_RISK:
                catalog[domain.lower()] = {"app_name": app_name, "category": category, "risk": risk}
    return catalog


def match_saas(host: str, catalog: dict[str, dict]) -> dict | None:
    """Most-specific catalog entry matching host (exact or subdomain), or None."""
    if not catalog or not host:
        return None
    host = host.lower().rstrip(".")
    best, best_len = None, -1
    for domain, meta in catalog.items():
        if (host == domain or host.endswith("." + domain)) and len(domain) > best_len:
            best, best_len = meta, len(domain)
    return best


def _device_label(mac: str, hostname) -> str:
    """Human device identity from MAC vendor (OUI) + DHCP/mDNS hostname."""
    vendor = vendor_from_mac(mac)
    host   = hostname if isinstance(hostname, str) and hostname else None
    if vendor and host:
        return f"{vendor} · {host}"
    return vendor or host or "unknown"


# ── Risk classification ────────────────────────────────────────────────────────
# Thresholds are empirical tertiles of the IF anomaly_score distribution on
# hybrid-flagged records (RF positive OR IF below gate) — NOT the theoretical
# score_samples() range of [-0.5, 0]. Recalibrated 2026-07-04 for the hybrid
# IF+RF model: measured from 13,141 flagged holdout CICIDS2017 records, score
# range [-0.7645, -0.3619], p33=-0.5638, p66=-0.4594. Recalibrate these two
# constants (e.g. via `SELECT percentile_cont(0.33/0.66) WITHIN GROUP
# (ORDER BY anomaly_score) FROM detections`) if the model is retrained
# and the score range shifts.
# Recalibrated 2026-07-20 to LIVE network traffic — the CICIDS2017 tertiles
# (-0.564/-0.459) left every live flow at high/medium because live IsolationForest
# scores run more anomalous (domain shift). Measured from 185 live-captured flagged
# flows: range [-0.7509, -0.5248], p33=-0.685, p66=-0.563. These are per-network:
# recompute the tertiles (SELECT percentile_cont(0.33/0.66) ...) after retraining or
# when deploying on a different network.
RISK_THRESHOLD_HIGH   = -0.685  # score < -0.685                    → high   (bottom third)
RISK_THRESHOLD_MEDIUM = -0.563  # -0.685 <= score < -0.563         → medium (middle third)
                                 # score >= -0.563                  → low    (top third)


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
# Hybrid two-stage detector:
#   Stage 1 — IsolationForest trained on BENIGN-only traffic (unsupervised).
#     Learns the "normal" baseline; catches anomalies, including attack types
#     never seen in training. Gated at ~2% FPR so it adds novel-threat
#     coverage without flooding the hybrid with false positives.
#   Stage 2 — RandomForest trained on the labeled mix (supervised).
#     Recognises known attack patterns with very high precision/recall.
#   Final detection = RF says attack OR IF score below the gate.
# Both models train on a deterministic 70% partition (train_mask); the
# remaining 30% holdout is never seen during training and is what
# evaluate.py measures.
IF_GATE_FPR = 0.02   # benign-score percentile used as the IF decision gate


def train(
    df: pd.DataFrame = None,
    n_estimators: int    = 500,
    contamination: float = 0.05,
    max_samples          = 1.0,   # use every benign training row per tree
):
    if df is None:
        print("Loading CICIDS2017 data …")
        df = load_all()

    labeled = "Label" in df.columns
    if labeled:
        mask     = train_mask(df)
        df_train = df[mask]
        df_hold  = df[~mask]
        df_benign = df_train[df_train["Label"] == "BENIGN"].copy()
        print(f"Split: {len(df_train):,} train / {len(df_hold):,} holdout")
        print(f"Benign-only IF training set: {len(df_benign):,} rows")
    else:
        df_train, df_hold, df_benign = df, None, df

    X, _, scaler, _ = preprocess(df_benign, fit=True)

    model = IsolationForest(
        n_estimators  = n_estimators,
        contamination = contamination,
        max_samples   = max_samples,
        random_state  = 42,
        n_jobs        = -1,
    )
    print(f"Training Isolation Forest on {X.shape[0]:,} records, {X.shape[1]} features …")
    model.fit(X)

    rf = None
    if labeled:
        X_tr, df_tr, _, _ = preprocess(df_train, fit=False, scaler=scaler)
        y_tr = df_tr["shadow_it_label"].values

        # ── IF decision gate: strict, from the benign score distribution ──────
        # predict() flags score_samples(X) < offset_. Set the gate so only
        # IF_GATE_FPR of benign training traffic is flagged — in the hybrid,
        # the IF's job is high-confidence novel anomalies, not volume.
        ben_scores    = model.score_samples(X_tr[y_tr == 0])
        model.offset_ = float(np.percentile(ben_scores, IF_GATE_FPR * 100))
        print(f"IF gate: score < {model.offset_:.4f} -> anomaly "
              f"({IF_GATE_FPR*100:.0f}% benign FPR)")

        # ── Stage 2: supervised RandomForest on the labeled train partition ───
        print(f"Training Random Forest on {len(y_tr):,} labeled records …")
        rf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
        rf.fit(X_tr, y_tr)

        # ── Holdout report (rows never seen by either model) ──────────────────
        if len(df_hold):
            X_ho, df_ho, _, _ = preprocess(df_hold, fit=False, scaler=scaler)
            y_ho    = df_ho["shadow_it_label"].values
            flagged = (model.predict(X_ho) == -1) | (rf.predict(X_ho) == 1)
            acc = (flagged == y_ho).mean()
            tp  = int((flagged & (y_ho == 1)).sum())
            fp  = int((flagged & (y_ho == 0)).sum())
            fn  = int((~flagged & (y_ho == 1)).sum())
            prec = tp / (tp + fp) if tp + fp else 0
            rec  = tp / (tp + fn) if tp + fn else 0
            print(f"Holdout ({len(y_ho):,} rows): hybrid acc={acc:.4f} "
                  f"P={prec:.4f} R={rec:.4f}")

    os.makedirs(ARTIFACTS, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    if rf is not None:
        joblib.dump(rf, RF_PATH)
        print(f"RF saved -> {RF_PATH}")
    save_scaler(scaler)

    print(f"Model saved -> {MODEL_PATH}")
    return model, scaler


def load_model():
    return joblib.load(MODEL_PATH)


def load_rf():
    """Supervised stage of the hybrid; None if not trained (e.g. unlabeled data)."""
    return joblib.load(RF_PATH) if os.path.exists(RF_PATH) else None


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
    rf     = load_rf()
    scaler = load_scaler()

    X, df_clean, _, _ = preprocess(df, fit=False, scaler=scaler)

    # Hybrid rule: known-attack pattern (RF) OR strong unsupervised anomaly (IF)
    scores  = model.score_samples(X)
    flagged = model.predict(X) == -1
    if rf is not None:
        flagged |= rf.predict(X) == 1

    allowlist  = load_allowlist()
    catalog    = load_saas_catalog()
    suppressed = 0
    saas_hits  = 0

    results = []
    for i in range(len(df_clean)):
        row = df_clean.iloc[i].to_dict()
        score = float(scores[i])

        # Extracted service hostname (TLS SNI / HTTP Host / passive DNS). CICIDS
        # records have no "sni" and fall back to the raw destination IP.
        sni  = row.get("sni")
        host = sni if isinstance(sni, str) and sni else None
        dst  = host or str(row.get("Destination IP", "Unknown"))

        # Sanctioned services are authorised IT, not Shadow IT — always suppress
        # (named destinations only; a raw IP can't be verified as sanctioned).
        if host and is_sanctioned(host, allowlist):
            suppressed += 1
            continue

        # ── Two independent detection paths ────────────────────────────────────
        #  (a) SaaS catalog: an unsanctioned known cloud app IS Shadow IT even if
        #      the flow looks perfectly normal to the ML model.
        #  (b) Anomaly: the hybrid IF+RF flags unusual/attack-like traffic.
        app = match_saas(host, catalog) if host else None
        if app:
            saas_hits += 1
            stype    = "software"
            risk     = app["risk"]
            dst      = f'{app["app_name"]} ({host})'
            category = app["category"]
            source   = "catalog"
        elif flagged[i]:
            stype = row.get("shadow_it_type") or _infer_type(row)
            if stype == "none":
                stype = _infer_type(row)
            risk     = classify_risk(score, stype)
            category = None
            source   = "anomaly"
        else:
            continue   # neither a known unsanctioned app nor anomalous — skip

        results.append({
            "src_ip":           str(row.get("Source IP",         "0.0.0.0")),
            "src_mac":          str(row.get("src_mac",           "Unknown")),
            "dst_domain":       dst,
            "protocol":         _proto_name(row.get("Protocol",  6)),
            "bytes_sent":       int(float(row.get("Total Length of Fwd Packets", 0))),
            "bytes_received":   int(float(row.get("Total Length of Bwd Packets", 0))),
            "duration":         round(float(row.get("Flow Duration", 0)) / 1_000_000, 4),
            # Device identity: MAC OUI vendor + DHCP/mDNS hostname when known.
            "device_type":      _device_label(row.get("src_mac"), row.get("device_hostname")),
            "shadow_it_type":   stype,
            "risk_level":       risk,
            "anomaly_score":    score,
            "app_category":     category,   # SaaS category for catalog hits, else None
            "detection_source": source,     # 'catalog' | 'anomaly'
        })

    elapsed = time.time() - t0
    notes = []
    if saas_hits:  notes.append(f"{saas_hits} unsanctioned SaaS")
    if suppressed: notes.append(f"{suppressed} sanctioned suppressed")
    note = f" ({', '.join(notes)})" if notes else ""
    print(f"detect(): {len(results)} detections / {len(df_clean)} records in {elapsed:.3f}s{note}")
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
