"""
Sprint 2 — Synthetic Network Traffic Dataset Generator
Run from shadow-it-detection/ : python ml/generate_dataset.py
Produces data/network_traffic.csv with ~10 000 records and ~10% Shadow IT.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd
import random
from datetime import datetime, timedelta

random.seed(42)
np.random.seed(42)

NUM_RECORDS    = 10_000
SHADOW_RATIO   = 0.10

# 50 known-good MAC prefixes that represent authorised corporate devices
AUTHORIZED_MACS = [
    f"00:1A:{i:02X}:{random.randint(0,255):02X}:{random.randint(0,255):02X}:{random.randint(0,255):02X}"
    for i in range(50)
]

SHADOW_DOMAINS = [
    "chat.openai.com", "gemini.google.com", "web.whatsapp.com",
    "telegram.org", "mail.google.com", "mail.yahoo.com",
]

LEGIT_DOMAINS = [
    "company-intranet.local", "github.com", "stackoverflow.com",
    "docs.microsoft.com", "office365.com", "teams.microsoft.com",
    "sharepoint.com", "azure.microsoft.com", "aws.amazon.com",
    "bing.com", "npmjs.com", "pypi.org", "jira.company.local",
    "confluence.company.local", "gitlab.company.local",
]

PROTOCOLS    = ["TCP", "UDP", "HTTPS"]
AUTH_DEVICES = ["desktop", "laptop"]
ALL_DEVICES  = ["desktop", "laptop", "mobile", "unknown"]
PORTS        = [80, 443, 8080, 22, 53, 3389, 5900, 8443, 25, 587]


def _ip(subnet="192.168.1"):
    return f"{subnet}.{random.randint(2, 254)}"

def _ext_ip():
    return f"{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"

def _rnd_mac():
    return ":".join(f"{random.randint(0,255):02X}" for _ in range(6))

def _ts(start, days=90, hour_lo=8, hour_hi=18):
    return start + timedelta(
        days=random.randint(0, days),
        hours=random.randint(hour_lo, hour_hi),
        minutes=random.randint(0, 59),
        seconds=random.randint(0, 59),
    )


def normal_record(start):
    ts = _ts(start)
    return {
        "src_ip":         _ip("192.168.1"),
        "src_mac":        random.choice(AUTHORIZED_MACS),
        "dst_ip":         _ext_ip(),
        "dst_domain":     random.choice(LEGIT_DOMAINS),
        "protocol":       random.choice(PROTOCOLS),
        "dst_port":       random.choice(PORTS),
        "bytes_sent":     max(0, int(np.random.lognormal(8, 1.5))),
        "bytes_received": max(0, int(np.random.lognormal(10, 2.0))),
        "duration":       max(0.1, round(np.random.exponential(5), 2)),
        "timestamp":      ts.strftime("%Y-%m-%d %H:%M:%S"),
        "device_type":    random.choice(AUTH_DEVICES),
        "is_authorized":  True,
        "shadow_it_label": 0,
    }


def software_shadow(start):
    ts = _ts(start, hour_lo=9, hour_hi=17)
    domain = random.choice(SHADOW_DOMAINS)
    return {
        "src_ip":         _ip("192.168.1"),
        "src_mac":        random.choice(AUTHORIZED_MACS),
        "dst_ip":         _ext_ip(),
        "dst_domain":     domain,
        "protocol":       "HTTPS",
        "dst_port":       443,
        "bytes_sent":     max(0, int(np.random.lognormal(9, 2.0))),
        "bytes_received": max(0, int(np.random.lognormal(11, 2.0))),
        "duration":       max(0.1, round(np.random.exponential(25), 2)),
        "timestamp":      ts.strftime("%Y-%m-%d %H:%M:%S"),
        "device_type":    random.choice(AUTH_DEVICES),
        "is_authorized":  True,
        "shadow_it_label": 1,
    }


def hardware_shadow(start):
    ts = _ts(start, hour_lo=7, hour_hi=22)
    device = random.choice(["mobile", "unknown"])
    return {
        "src_ip":         _ip("10.0.1"),
        "src_mac":        _rnd_mac(),
        "dst_ip":         _ext_ip(),
        "dst_domain":     random.choice(LEGIT_DOMAINS + SHADOW_DOMAINS),
        "protocol":       random.choice(PROTOCOLS),
        "dst_port":       random.choice(PORTS),
        "bytes_sent":     max(0, int(np.random.lognormal(7, 3.0))),
        "bytes_received": max(0, int(np.random.lognormal(9, 3.0))),
        "duration":       max(0.1, round(np.random.exponential(10), 2)),
        "timestamp":      ts.strftime("%Y-%m-%d %H:%M:%S"),
        "device_type":    device,
        "is_authorized":  False,
        "shadow_it_label": 1,
    }


def generate_dataset(output_path="data/network_traffic.csv"):
    start = datetime(2025, 1, 1)
    shadow_n   = int(NUM_RECORDS * SHADOW_RATIO)
    software_n = shadow_n // 2
    hardware_n = shadow_n - software_n
    normal_n   = NUM_RECORDS - shadow_n

    records = (
        [normal_record(start)   for _ in range(normal_n)]
        + [software_shadow(start) for _ in range(software_n)]
        + [hardware_shadow(start) for _ in range(hardware_n)]
    )
    random.shuffle(records)

    df = pd.DataFrame(records)
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    df.to_csv(output_path, index=False)

    total   = len(df)
    shadow  = int(df["shadow_it_label"].sum())
    sw      = len([r for r in records if r["shadow_it_label"] == 1 and r["dst_domain"] in SHADOW_DOMAINS])
    hw      = shadow - sw

    print(f"Dataset saved  → {output_path}")
    print(f"  Total records  : {total:,}")
    print(f"  Normal traffic : {normal_n:,}  ({normal_n/total*100:.1f}%)")
    print(f"  Shadow IT total: {shadow:,}   ({shadow/total*100:.1f}%)")
    print(f"    Software     : ~{software_n:,}")
    print(f"    Hardware     : ~{hardware_n:,}")
    return df


if __name__ == "__main__":
    generate_dataset()
