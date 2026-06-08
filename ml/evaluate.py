"""
Sprint 4 — Performance Evaluation (CICIDS2017 edition)
Run from shadow-it-detection/ : python ml/evaluate.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix

from ml.load_cicids import load_all, FEATURE_COLS
from ml.preprocess  import preprocess, load_scaler
from ml.model       import load_model, classify_risk, _infer_type

REPORTS = os.path.join(os.path.dirname(__file__), "reports")


def compute_metrics(y_true, y_pred) -> dict:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()
    acc  = (tp + tn) / (tp + tn + fp + fn) if (tp+tn+fp+fn) > 0 else 0
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0
    rec  = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1   = 2*prec*rec/(prec+rec) if (prec+rec) > 0 else 0
    fpr  = fp / (fp + tn)        if (fp + tn)  > 0 else 0
    return dict(accuracy=acc, precision=prec, recall=rec,
                f1_score=f1, false_positive_rate=fpr,
                tp=int(tp), tn=int(tn), fp=int(fp), fn=int(fn))


# ── 6 Test Scenarios ───────────────────────────────────────────────────────────
# Each scenario is a single CICIDS-format record with a known expected label.
SCENARIOS = [
    {
        "id": "S1", "type": "Software",
        "description": "Web brute-force from work device",
        "record": {
            "Flow Duration": 120_000_000, "Total Fwd Packets": 500,
            "Total Backward Packets": 480, "Total Length of Fwd Packets": 32_000,
            "Total Length of Bwd Packets": 28_000, "Flow Bytes/s": 500_000,
            "Flow Packets/s": 8_000, "Fwd Packet Length Mean": 64,
            "Bwd Packet Length Mean": 58, "Flow IAT Mean": 250,
            "Packet Length Mean": 61, "Packet Length Std": 12,
            "FIN Flag Count": 0, "SYN Flag Count": 1, "RST Flag Count": 0,
            "PSH Flag Count": 200, "ACK Flag Count": 480,
            "Average Packet Size": 63, "Init_Win_bytes_forward": 8192,
            "Init_Win_bytes_backward": 8192,
            "shadow_it_type": "software",
        }, "expected": 1,
    },
    {
        "id": "S2", "type": "Software",
        "description": "XSS web attack traffic",
        "record": {
            "Flow Duration": 80_000_000, "Total Fwd Packets": 300,
            "Total Backward Packets": 290, "Total Length of Fwd Packets": 45_000,
            "Total Length of Bwd Packets": 38_000, "Flow Bytes/s": 1_037_500,
            "Flow Packets/s": 7_375, "Fwd Packet Length Mean": 150,
            "Bwd Packet Length Mean": 131, "Flow IAT Mean": 300,
            "Packet Length Mean": 140, "Packet Length Std": 30,
            "FIN Flag Count": 1, "SYN Flag Count": 1, "RST Flag Count": 0,
            "PSH Flag Count": 150, "ACK Flag Count": 290,
            "Average Packet Size": 141, "Init_Win_bytes_forward": 16384,
            "Init_Win_bytes_backward": 16384,
            "shadow_it_type": "software",
        }, "expected": 1,
    },
    {
        "id": "S3", "type": "Software",
        "description": "SQL injection attempt",
        "record": {
            "Flow Duration": 50_000_000, "Total Fwd Packets": 100,
            "Total Backward Packets": 95, "Total Length of Fwd Packets": 18_000,
            "Total Length of Bwd Packets": 12_000, "Flow Bytes/s": 600_000,
            "Flow Packets/s": 3_900, "Fwd Packet Length Mean": 180,
            "Bwd Packet Length Mean": 126, "Flow IAT Mean": 520,
            "Packet Length Mean": 153, "Packet Length Std": 40,
            "FIN Flag Count": 1, "SYN Flag Count": 1, "RST Flag Count": 0,
            "PSH Flag Count": 50, "ACK Flag Count": 95,
            "Average Packet Size": 154, "Init_Win_bytes_forward": 8192,
            "Init_Win_bytes_backward": 8192,
            "shadow_it_type": "software",
        }, "expected": 1,
    },
    {
        "id": "S4", "type": "Hardware",
        "description": "Port scan from unknown device",
        "record": {
            "Flow Duration": 1_000, "Total Fwd Packets": 1,
            "Total Backward Packets": 0, "Total Length of Fwd Packets": 0,
            "Total Length of Bwd Packets": 0, "Flow Bytes/s": 0,
            "Flow Packets/s": 1_000_000, "Fwd Packet Length Mean": 0,
            "Bwd Packet Length Mean": 0, "Flow IAT Mean": 0,
            "Packet Length Mean": 0, "Packet Length Std": 0,
            "FIN Flag Count": 0, "SYN Flag Count": 1, "RST Flag Count": 0,
            "PSH Flag Count": 0, "ACK Flag Count": 0,
            "Average Packet Size": 0, "Init_Win_bytes_forward": 1024,
            "Init_Win_bytes_backward": -1,
            "shadow_it_type": "hardware",
        }, "expected": 1,
    },
    {
        "id": "S5", "type": "Hardware",
        "description": "DDoS flood from rogue device",
        "record": {
            "Flow Duration": 10_000, "Total Fwd Packets": 5_000,
            "Total Backward Packets": 0, "Total Length of Fwd Packets": 320_000,
            "Total Length of Bwd Packets": 0, "Flow Bytes/s": 32_000_000_000,
            "Flow Packets/s": 500_000_000, "Fwd Packet Length Mean": 64,
            "Bwd Packet Length Mean": 0, "Flow IAT Mean": 2,
            "Packet Length Mean": 64, "Packet Length Std": 0,
            "FIN Flag Count": 0, "SYN Flag Count": 5_000, "RST Flag Count": 0,
            "PSH Flag Count": 0, "ACK Flag Count": 0,
            "Average Packet Size": 64, "Init_Win_bytes_forward": 65535,
            "Init_Win_bytes_backward": -1,
            "shadow_it_type": "hardware",
        }, "expected": 1,
    },
    {
        "id": "S6", "type": "Mixed",
        "description": "Infiltration: unknown device using web exploit",
        "record": {
            "Flow Duration": 200_000_000, "Total Fwd Packets": 800,
            "Total Backward Packets": 750, "Total Length of Fwd Packets": 120_000,
            "Total Length of Bwd Packets": 95_000, "Flow Bytes/s": 1_075_000,
            "Flow Packets/s": 7_750, "Fwd Packet Length Mean": 150,
            "Bwd Packet Length Mean": 127, "Flow IAT Mean": 260,
            "Packet Length Mean": 139, "Packet Length Std": 28,
            "FIN Flag Count": 1, "SYN Flag Count": 10, "RST Flag Count": 2,
            "PSH Flag Count": 400, "ACK Flag Count": 750,
            "Average Packet Size": 138, "Init_Win_bytes_forward": 65535,
            "Init_Win_bytes_backward": 65535,
            "shadow_it_type": "mixed",
        }, "expected": 1,
    },
]


def run_scenario(sc, model, scaler) -> dict:
    df = pd.DataFrame([sc["record"]])
    t0 = time.perf_counter()
    X, _, _, _ = preprocess(df, fit=False, scaler=scaler)
    pred  = model.predict(X)[0]
    score = model.score_samples(X)[0]
    ms    = (time.perf_counter() - t0) * 1000

    predicted = 1 if pred == -1 else 0
    stype = sc["record"].get("shadow_it_type", "hardware") if predicted == 1 else "—"
    risk  = classify_risk(score, stype) if predicted == 1 else "—"

    return {
        "id": sc["id"], "type": sc["type"],
        "description": sc["description"],
        "expected": sc["expected"], "predicted": predicted,
        "correct": predicted == sc["expected"],
        "shadow_it_type": stype, "risk_level": risk,
        "anomaly_score": round(float(score), 5),
        "response_ms": round(ms, 3),
    }


def evaluate():
    W = 74
    print("=" * W)
    print("  SHADOW IT DETECTION — PERFORMANCE EVALUATION (CICIDS2017)")
    print("=" * W)

    print("\nLoading dataset …")
    df     = load_all(sample_per_file=20_000)
    model  = load_model()
    scaler = load_scaler()

    t0 = time.perf_counter()
    X, df_clean, _, _ = preprocess(df, fit=False, scaler=scaler)
    preds = model.predict(X)
    detection_time = time.perf_counter() - t0

    y_pred = (preds == -1).astype(int)
    y_true = df_clean["shadow_it_label"].values if "shadow_it_label" in df_clean.columns \
             else np.zeros(len(y_pred), dtype=int)

    m = compute_metrics(y_true, y_pred)

    print("\n[OVERALL METRICS]")
    print(f"  Accuracy            : {m['accuracy']:.4f}  ({m['accuracy']*100:.2f}%)")
    print(f"  Precision           : {m['precision']:.4f}")
    print(f"  Recall              : {m['recall']:.4f}")
    print(f"  F1-Score            : {m['f1_score']:.4f}")
    print(f"  False Positive Rate : {m['false_positive_rate']:.4f}")
    print(f"  TP={m['tp']}  TN={m['tn']}  FP={m['fp']}  FN={m['fn']}")

    print("\n[TIMING]")
    print(f"  Detection time  : {detection_time:.3f}s  ({len(df_clean):,} records)")
    print(f"  Per record      : {detection_time/len(df_clean)*1000:.3f} ms")
    t_api = time.perf_counter()
    model.score_samples(X[:1])
    print(f"  API latency     : {(time.perf_counter()-t_api)*1000:.3f} ms (single record)")

    print("\n[TEST SCENARIOS]")
    hdr = f"{'ID':<4} {'Type':<10} {'Exp':<5} {'Got':<5} {'OK?':<5} {'SIT Type':<10} {'Risk':<8} {'Score':<9} {'ms'}"
    print(hdr); print("-" * len(hdr))

    rows = []
    for sc in SCENARIOS:
        r = run_scenario(sc, model, scaler)
        rows.append(r)
        ok = "YES" if r["correct"] else "NO "
        print(f"{r['id']:<4} {r['type']:<10} {r['expected']:<5} {r['predicted']:<5} "
              f"{ok:<5} {r['shadow_it_type']:<10} {r['risk_level']:<8} "
              f"{r['anomaly_score']:<9.5f} {r['response_ms']:.2f}")

    correct = sum(1 for r in rows if r["correct"])
    print(f"\nScenario accuracy : {correct}/{len(SCENARIOS)}")

    os.makedirs(REPORTS, exist_ok=True)
    pd.DataFrame(rows).to_csv(os.path.join(REPORTS, "scenario_results.csv"),  index=False)
    pd.DataFrame([{**m, "detection_time_s": round(detection_time,4),
                   "scenario_correct": correct, "scenario_total": len(SCENARIOS)}
                  ]).to_csv(os.path.join(REPORTS, "metrics_summary.csv"), index=False)

    print(f"\nReports → {REPORTS}/")
    print("=" * W)
    return m, rows


if __name__ == "__main__":
    evaluate()
