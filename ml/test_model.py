"""
Quick model test — runs the trained Isolation Forest against
sample CICIDS records and prints a clear pass/fail result.

Run from shadow-it-detection/:
    python ml/test_model.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from ml.model     import load_model, classify_risk, _infer_type
from ml.preprocess import preprocess, load_scaler

W = 65
print("=" * W)
print("  ISOLATION FOREST — QUICK MODEL TEST")
print("=" * W)

# ── Load model ────────────────────────────────────────────────
print("\n[1] Loading model and scaler …")
try:
    model  = load_model()
    scaler = load_scaler()
    print("  OK — model and scaler loaded")
except FileNotFoundError as e:
    print(f"  ERROR: {e}")
    print("  Run 'python ml/model.py' first to train the model.")
    sys.exit(1)

# ── Sample test records ───────────────────────────────────────
# Format: CICIDS feature columns
TEST_RECORDS = [
    {
        "label":       "Normal browsing (BENIGN)",
        "expected":    "normal",
        "Flow Duration": 5_000_000,
        "Total Fwd Packets": 10, "Total Backward Packets": 8,
        "Total Length of Fwd Packets": 1_200, "Total Length of Bwd Packets": 900,
        "Flow Bytes/s": 420, "Flow Packets/s": 3.6,
        "Fwd Packet Length Mean": 120, "Bwd Packet Length Mean": 112,
        "Flow IAT Mean": 500_000, "Packet Length Mean": 116,
        "Packet Length Std": 15, "FIN Flag Count": 1,
        "SYN Flag Count": 1, "RST Flag Count": 0,
        "PSH Flag Count": 4, "ACK Flag Count": 8,
        "Average Packet Size": 116, "Init_Win_bytes_forward": 65535,
        "Init_Win_bytes_backward": 65535,
    },
    {
        "label":       "Normal HTTPS session (BENIGN)",
        "expected":    "normal",
        "Flow Duration": 2_000_000,
        "Total Fwd Packets": 5, "Total Backward Packets": 4,
        "Total Length of Fwd Packets": 600, "Total Length of Bwd Packets": 480,
        "Flow Bytes/s": 540, "Flow Packets/s": 4.5,
        "Fwd Packet Length Mean": 120, "Bwd Packet Length Mean": 120,
        "Flow IAT Mean": 400_000, "Packet Length Mean": 120,
        "Packet Length Std": 0, "FIN Flag Count": 1,
        "SYN Flag Count": 1, "RST Flag Count": 0,
        "PSH Flag Count": 2, "ACK Flag Count": 4,
        "Average Packet Size": 120, "Init_Win_bytes_forward": 65535,
        "Init_Win_bytes_backward": 65535,
    },
    {
        "label":       "Port scan (Shadow IT — Hardware)",
        "expected":    "anomaly",
        "Flow Duration": 1_000,
        "Total Fwd Packets": 1, "Total Backward Packets": 0,
        "Total Length of Fwd Packets": 0, "Total Length of Bwd Packets": 0,
        "Flow Bytes/s": 0, "Flow Packets/s": 1_000_000,
        "Fwd Packet Length Mean": 0, "Bwd Packet Length Mean": 0,
        "Flow IAT Mean": 0, "Packet Length Mean": 0,
        "Packet Length Std": 0, "FIN Flag Count": 0,
        "SYN Flag Count": 1, "RST Flag Count": 0,
        "PSH Flag Count": 0, "ACK Flag Count": 0,
        "Average Packet Size": 0, "Init_Win_bytes_forward": 1024,
        "Init_Win_bytes_backward": -1,
    },
    {
        "label":       "DDoS flood (Shadow IT — Hardware)",
        "expected":    "anomaly",
        "Flow Duration": 10_000,
        "Total Fwd Packets": 5_000, "Total Backward Packets": 0,
        "Total Length of Fwd Packets": 320_000, "Total Length of Bwd Packets": 0,
        "Flow Bytes/s": 32_000_000_000, "Flow Packets/s": 500_000_000,
        "Fwd Packet Length Mean": 64, "Bwd Packet Length Mean": 0,
        "Flow IAT Mean": 2, "Packet Length Mean": 64,
        "Packet Length Std": 0, "FIN Flag Count": 0,
        "SYN Flag Count": 5_000, "RST Flag Count": 0,
        "PSH Flag Count": 0, "ACK Flag Count": 0,
        "Average Packet Size": 64, "Init_Win_bytes_forward": 65535,
        "Init_Win_bytes_backward": -1,
    },
    {
        "label":       "Web brute-force (Shadow IT — Software)",
        "expected":    "anomaly",
        "Flow Duration": 120_000_000,
        "Total Fwd Packets": 500, "Total Backward Packets": 480,
        "Total Length of Fwd Packets": 32_000, "Total Length of Bwd Packets": 28_000,
        "Flow Bytes/s": 500_000, "Flow Packets/s": 8_000,
        "Fwd Packet Length Mean": 64, "Bwd Packet Length Mean": 58,
        "Flow IAT Mean": 250, "Packet Length Mean": 61,
        "Packet Length Std": 12, "FIN Flag Count": 0,
        "SYN Flag Count": 1, "RST Flag Count": 0,
        "PSH Flag Count": 200, "ACK Flag Count": 480,
        "Average Packet Size": 63, "Init_Win_bytes_forward": 8192,
        "Init_Win_bytes_backward": 8192,
    },
    {
        "label":       "Infiltration (Shadow IT — Mixed)",
        "expected":    "anomaly",
        "Flow Duration": 200_000_000,
        "Total Fwd Packets": 800, "Total Backward Packets": 750,
        "Total Length of Fwd Packets": 120_000, "Total Length of Bwd Packets": 95_000,
        "Flow Bytes/s": 1_075_000, "Flow Packets/s": 7_750,
        "Fwd Packet Length Mean": 150, "Bwd Packet Length Mean": 127,
        "Flow IAT Mean": 260, "Packet Length Mean": 139,
        "Packet Length Std": 28, "FIN Flag Count": 1,
        "SYN Flag Count": 10, "RST Flag Count": 2,
        "PSH Flag Count": 400, "ACK Flag Count": 750,
        "Average Packet Size": 138, "Init_Win_bytes_forward": 65535,
        "Init_Win_bytes_backward": 65535,
    },
]

# ── Run predictions ───────────────────────────────────────────
print("\n[2] Running predictions …\n")
print(f"  {'Record':<42} {'Expected':<10} {'Result':<10} {'Risk':<8} {'Pass?'}")
print("  " + "-" * 58)

passed = 0
for rec in TEST_RECORDS:
    label    = rec.pop("label")
    expected = rec.pop("expected")

    df = pd.DataFrame([rec])
    X, _, _, _ = preprocess(df, fit=False, scaler=scaler)
    pred  = model.predict(X)[0]
    score = model.score_samples(X)[0]

    result = "anomaly" if pred == -1 else "normal"
    stype  = _infer_type(rec)
    risk   = classify_risk(score, stype) if result == "anomaly" else "—"
    ok     = result == expected
    if ok:
        passed += 1

    status = "PASS ✓" if ok else "FAIL ✗"
    print(f"  {label:<42} {expected:<10} {result:<10} {risk:<8} {status}")

# ── Summary ───────────────────────────────────────────────────
print()
print(f"  Result: {passed}/{len(TEST_RECORDS)} tests passed")

if passed == len(TEST_RECORDS):
    print("\n  Model is working correctly.")
elif passed >= len(TEST_RECORDS) * 0.7:
    print("\n  Model is mostly working. Consider retraining with more data.")
else:
    print("\n  Model needs retraining. Run: python ml/model.py")

print("=" * W)
