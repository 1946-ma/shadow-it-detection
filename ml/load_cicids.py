"""
CICIDS2017 Dataset Loader
Loads all 8 PCAP-derived CSVs, cleans them, and returns a unified DataFrame
with a binary shadow_it_label (0=BENIGN, 1=attack/anomaly).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd

# Absolute path so loading works regardless of the current working directory
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

CICIDS_FILES = [
    "Monday-WorkingHours.pcap_ISCX.csv",
    "Tuesday-WorkingHours.pcap_ISCX.csv",
    "Wednesday-workingHours.pcap_ISCX.csv",
    "Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv",
    "Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv",
    "Friday-WorkingHours-Morning.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv",
]

# Features selected for Isolation Forest (all numeric, available in every file)
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

# Shadow IT type mapping from CICIDS label
LABEL_TO_TYPE = {
    "DDoS":                          "hardware",
    "DoS Hulk":                      "hardware",
    "DoS GoldenEye":                 "hardware",
    "DoS slowloris":                 "hardware",
    "DoS Slowhttptest":              "hardware",
    "Heartbleed":                    "hardware",
    "PortScan":                      "hardware",
    "FTP-Patator":                   "hardware",
    "SSH-Patator":                   "hardware",
    "Bot":                           "mixed",
    "Infiltration":                  "mixed",
    "Web Attack \x96 Brute Force":   "software",
    "Web Attack \x96 XSS":           "software",
    "Web Attack \x96 Sql Injection": "software",
    "Web Attack – Brute Force":      "software",
    "Web Attack – XSS":              "software",
    "Web Attack – Sql Injection":    "software",
}


def train_mask(df: pd.DataFrame) -> pd.Series:
    """
    Deterministic 70/30 train/holdout split, stable across scripts and runs.
    Hashes flow-identity columns (IPs/ports/timestamp) rather than feature
    values, so the assignment is immune to per-sample outlier clipping.
    Rows lacking identity columns (e.g. synthetic data) all land in train.
    """
    id_cols = [c for c in ("Source IP", "Destination IP", "Source Port",
                           "Destination Port", "Timestamp") if c in df.columns]
    if not id_cols:
        return pd.Series(True, index=df.index)
    h = pd.util.hash_pandas_object(
        df[id_cols].astype(str).agg("|".join, axis=1), index=False)
    return pd.Series((h % 10) < 7, index=df.index)  # True = train (70%)


def _read_file(path: str, nrows=None) -> pd.DataFrame:
    """Read one CICIDS CSV, trying UTF-8 then Latin-1."""
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(path, encoding=enc, low_memory=False, nrows=nrows)
            df.columns = df.columns.str.strip()
            return df
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Cannot decode {path}")


def load_fast(nrows_per_file: int = 300) -> pd.DataFrame:
    """
    Fast loader for API use — reads only the first N rows of each file.
    No sampling needed so it returns almost instantly.
    """
    frames = []
    for fname in CICIDS_FILES:
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            continue
        df = _read_file(path, nrows=nrows_per_file)
        needed = FEATURE_COLS + ["Label", "Source IP", "Destination IP",
                                  "Source Port", "Destination Port", "Protocol", "Timestamp"]
        df = df[[c for c in needed if c in df.columns]].copy()
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    combined.replace([np.inf, -np.inf], np.nan, inplace=True)
    combined.dropna(subset=FEATURE_COLS, inplace=True)

    combined["shadow_it_label"] = (combined["Label"] != "BENIGN").astype(int) \
        if "Label" in combined.columns else 0
    combined["shadow_it_type"] = combined["Label"].map(LABEL_TO_TYPE).fillna("hardware") \
        if "Label" in combined.columns else "hardware"
    combined.loc[combined["shadow_it_label"] == 0, "shadow_it_type"] = "none"

    return combined.reset_index(drop=True)


def load_all(sample_per_file: int = 30_000) -> pd.DataFrame:
    """
    Load, clean, and merge all CICIDS files.

    Parameters
    ----------
    sample_per_file : int
        Max rows to take from each file (keeps memory manageable).
        Set to None to load everything.

    Returns
    -------
    pd.DataFrame with columns = FEATURE_COLS + ['Label', 'shadow_it_label',
    'shadow_it_type', 'src_ip', 'dst_ip', 'src_port', 'dst_port_raw', 'protocol_raw', 'timestamp']
    """
    frames = []
    for fname in CICIDS_FILES:
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            print(f"  [SKIP] {fname} not found")
            continue

        df = _read_file(path)

        # Keep only needed columns
        needed = FEATURE_COLS + ["Label", "Source IP", "Destination IP",
                                  "Source Port", "Destination Port", "Protocol", "Timestamp"]
        available = [c for c in needed if c in df.columns]
        df = df[available].copy()

        # Sample
        if sample_per_file and len(df) > sample_per_file:
            # Stratified: preserve attack/benign ratio
            benign  = df[df["Label"] == "BENIGN"]
            attacks = df[df["Label"] != "BENIGN"]
            n_att   = min(len(attacks), sample_per_file // 2)
            n_ben   = min(len(benign),  sample_per_file - n_att)
            df = pd.concat([
                benign.sample(n_ben,   random_state=42),
                attacks.sample(n_att,  random_state=42) if n_att > 0 else pd.DataFrame(),
            ])

        frames.append(df)
        print(f"  Loaded {fname}: {len(df):,} rows")

    combined = pd.concat(frames, ignore_index=True)
    print(f"\nCombined: {len(combined):,} rows before cleaning")

    # ── Clean ──────────────────────────────────────────────────────────────────
    # Replace infinite values
    combined.replace([np.inf, -np.inf], np.nan, inplace=True)

    # Drop rows missing any feature or label
    combined.dropna(subset=FEATURE_COLS + ["Label"], inplace=True)

    # Drop exact duplicates
    combined.drop_duplicates(inplace=True)

    # Clip extreme outliers per feature (99.9th percentile cap)
    for col in FEATURE_COLS:
        cap = combined[col].quantile(0.999)
        combined[col] = combined[col].clip(upper=cap)

    # Binary label
    combined["shadow_it_label"] = (combined["Label"] != "BENIGN").astype(int)

    # Shadow IT type
    combined["shadow_it_type"] = combined["Label"].map(LABEL_TO_TYPE).fillna("hardware")
    combined.loc[combined["shadow_it_label"] == 0, "shadow_it_type"] = "none"

    combined.reset_index(drop=True, inplace=True)
    print(f"After cleaning: {len(combined):,} rows")
    n_attack = int(combined["shadow_it_label"].sum())
    print(f"  BENIGN : {len(combined)-n_attack:,}")
    print(f"  Attack : {n_attack:,}  ({n_attack/len(combined)*100:.1f}%)")

    return combined


if __name__ == "__main__":
    df = load_all()
    out = os.path.join(DATA_DIR, "cicids_combined.csv")
    df.to_csv(out, index=False)
    print(f"\nSaved -> {out}")
