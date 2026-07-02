#!/usr/bin/env python3
"""
Shadow IT Traffic Generator
============================
Run this script inside a Kali Linux VM on the virtual network.
It generates traffic patterns that the Shadow IT Detection system will flag.

Requirements:
    Scapy is pre-installed on Kali Linux.
    Must be run as root (raw socket access).

Usage:
    sudo python3 traffic_gen.py --target 192.168.100.20
    sudo python3 traffic_gen.py --target 192.168.100.20 --scenario scan
    sudo python3 traffic_gen.py --target 192.168.100.20 --scenario all --delay 5
    sudo python3 traffic_gen.py --target 192.168.100.20 --scenario flood --iface eth0

Scenarios:
    sweep   — ICMP ping sweep across the /24 subnet
    scan    — TCP SYN port scan across common ports  (HIGH risk)
    flood   — SYN flood burst against one port        (HIGH risk)
    udp     — UDP packet flood to various ports       (MEDIUM–HIGH risk)
    bulk    — High-volume TCP data transfer           (MEDIUM risk)
    stealth — Slow distributed port scan              (LOW–MEDIUM risk)
    normal  — Normal-looking periodic connections     (LOW / undetected)
    all     — Run every scenario in sequence
"""

import sys
import os
import time
import random
import argparse
import socket
import struct
import threading
from datetime import datetime

# Windows consoles default to a legacy codepage (e.g. cp1252) that can't
# encode the box-drawing characters used in banner()/progress() below.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Scapy import ──────────────────────────────────────────────────────────────
try:
    from scapy.all import (
        IP, TCP, UDP, ICMP,
        send, RandShort, conf,
    )
    conf.verb = 0          # suppress per-packet output
    SCAPY_OK = True
except ImportError:
    SCAPY_OK = False


# ── Console helpers ───────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def banner(text):
    line = "─" * 60
    print(f"\n{BOLD}{CYAN}{line}{RESET}")
    print(f"{BOLD}{CYAN}  {text}{RESET}")
    print(f"{BOLD}{CYAN}{line}{RESET}")

def info(msg):   print(f"  {CYAN}[*]{RESET} {msg}")
def ok(msg):     print(f"  {GREEN}[+]{RESET} {msg}")
def warn(msg):   print(f"  {YELLOW}[!]{RESET} {msg}")
def err(msg):    print(f"  {RED}[x]{RESET} {msg}")
def progress(current, total, label=""):
    pct  = int((current / total) * 40)
    bar  = "█" * pct + "░" * (40 - pct)
    print(f"\r  [{bar}] {current}/{total} {label}   ", end="", flush=True)


# ── Subnet helper ─────────────────────────────────────────────────────────────
def subnet_hosts(target_ip, count=20):
    """Return <count> host IPs in the same /24 as target, excluding target itself."""
    base = ".".join(target_ip.split(".")[:3])
    hosts = [f"{base}.{i}" for i in range(1, 255) if f"{base}.{i}" != target_ip]
    return random.sample(hosts, min(count, len(hosts)))


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 1 — ICMP Ping Sweep
# ══════════════════════════════════════════════════════════════════════════════
def scenario_sweep(target, iface):
    banner("Scenario 1 — ICMP Ping Sweep")
    info(f"Sweeping /24 subnet around {target} …")
    hosts = subnet_hosts(target, count=30)
    hosts.append(target)

    sent = 0
    for i, host in enumerate(hosts, 1):
        pkt = IP(dst=host) / ICMP()
        send(pkt, iface=iface)
        sent += 1
        progress(i, len(hosts), f"→ {host}")
        time.sleep(0.05)

    print()
    ok(f"Sent {sent} ICMP echo requests across subnet")
    ok("Expected detection: hardware / medium risk (high packet rate, many destinations)")


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 2 — TCP SYN Port Scan
# ══════════════════════════════════════════════════════════════════════════════
COMMON_PORTS = [
    21, 22, 23, 25, 53, 80, 110, 135, 139, 143,
    443, 445, 993, 995, 1433, 1521, 3306, 3389,
    5900, 6379, 8080, 8443, 8888, 9200, 27017,
    # extra to boost packet count for detection
    8000, 9000, 10000, 11211, 50000, 60000, 65535,
]

def scenario_scan(target, iface):
    banner("Scenario 2 — TCP SYN Port Scan")
    info(f"SYN scanning {len(COMMON_PORTS)} ports on {target} …")
    info("Mimics unauthorized device discovery / lateral movement")

    pkts = [
        IP(dst=target) / TCP(sport=RandShort(), dport=port, flags="S")
        for port in COMMON_PORTS
    ]

    sent = 0
    for i, pkt in enumerate(pkts, 1):
        send(pkt, iface=iface)
        sent += 1
        progress(i, len(pkts), f"→ port {COMMON_PORTS[i-1]}")
        time.sleep(0.02)

    print()
    ok(f"Sent {sent} SYN packets")
    ok("Expected detection: hardware / HIGH risk (SYN flag spike, many ports, high pps)")


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 3 — SYN Flood (DoS simulation)
# ══════════════════════════════════════════════════════════════════════════════
def scenario_flood(target, iface, duration=8, port=80):
    banner("Scenario 3 — SYN Flood")
    info(f"Flooding {target}:{port} for {duration}s …")
    info("Mimics a DoS/botnet Shadow IT device")
    warn("Stop is automatic after the timer — do NOT Ctrl+C")

    end_time = time.time() + duration
    sent = 0
    while time.time() < end_time:
        # Randomise source IP to simulate spoofed flood
        src_ip = f"{random.randint(10,192)}.{random.randint(0,254)}.{random.randint(0,254)}.{random.randint(1,254)}"
        pkt = IP(src=src_ip, dst=target) / TCP(sport=RandShort(), dport=port, flags="S")
        send(pkt, iface=iface)
        sent += 1
        if sent % 50 == 0:
            remaining = max(0, end_time - time.time())
            print(f"\r  Sent {sent} packets — {remaining:.1f}s remaining   ", end="", flush=True)

    print()
    ok(f"Sent {sent} SYN packets in {duration}s")
    ok("Expected detection: hardware / HIGH risk (extreme pps, RST/SYN storm, short flows)")


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 4 — UDP Flood
# ══════════════════════════════════════════════════════════════════════════════
UDP_PORTS = [53, 67, 68, 123, 161, 500, 1900, 5353, 69, 514]

def scenario_udp(target, iface, count=200):
    banner("Scenario 4 — UDP Packet Flood")
    info(f"Sending {count} UDP datagrams to {target} …")
    info("Mimics rogue DNS/NTP amplification or IoT device broadcasting")

    payload = b"X" * random.randint(100, 1400)
    sent = 0
    for i in range(1, count + 1):
        port = random.choice(UDP_PORTS)
        pkt  = IP(dst=target) / UDP(sport=RandShort(), dport=port) / payload
        send(pkt, iface=iface)
        sent += 1
        progress(i, count, f"→ UDP/{port}")
        time.sleep(0.01)

    print()
    ok(f"Sent {sent} UDP datagrams ({len(payload)} bytes each)")
    ok("Expected detection: mixed / MEDIUM–HIGH risk (high bytes/s, no TCP handshake)")


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 5 — High-Volume Bulk TCP Transfer
# ══════════════════════════════════════════════════════════════════════════════
def scenario_bulk(target, iface, port=9999, chunks=80):
    banner("Scenario 5 — High-Volume Bulk TCP Transfer")
    info(f"Sending large TCP payload to {target}:{port} …")
    info("Mimics shadow software exfiltrating data or a large unauthorized download")

    chunk_size = 8192
    total_bytes = chunks * chunk_size

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3)
        s.connect((target, port))

        sent = 0
        for i in range(chunks):
            data = bytes(random.getrandbits(8) for _ in range(chunk_size))
            s.sendall(data)
            sent += chunk_size
            progress(i + 1, chunks, f"{sent // 1024} KB sent")
            time.sleep(0.02)
        s.close()
        print()
        ok(f"Transferred {total_bytes // 1024} KB over TCP")

    except (ConnectionRefusedError, OSError):
        print()
        # Port not listening — send raw TCP data packets instead
        warn(f"Port {port} not open — sending raw TCP PSH packets instead")
        payload = b"A" * chunk_size
        for i in range(1, chunks + 1):
            pkt = IP(dst=target) / TCP(dport=port, flags="PA") / payload
            send(pkt, iface=iface)
            progress(i, chunks, f"{i * chunk_size // 1024} KB")
            time.sleep(0.02)
        print()
        ok(f"Sent {chunks * chunk_size // 1024} KB via raw TCP PSH packets")

    ok("Expected detection: software / MEDIUM risk (high bytes, long duration, big fwd packets)")


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 6 — Slow / Stealth Scan
# ══════════════════════════════════════════════════════════════════════════════
STEALTH_PORTS = [22, 80, 443, 8080, 3389, 3306, 5432, 6379, 27017, 9200]

def scenario_stealth(target, iface):
    banner("Scenario 6 — Slow Stealth Scan")
    info(f"Low-and-slow SYN scan against {target} …")
    info("Mimics an unauthorized device quietly mapping the network")

    sent = 0
    for i, port in enumerate(STEALTH_PORTS, 1):
        pkt = IP(dst=target) / TCP(sport=RandShort(), dport=port, flags="S")
        send(pkt, iface=iface)
        sent += 1
        progress(i, len(STEALTH_PORTS), f"→ port {port}")
        time.sleep(random.uniform(0.8, 2.0))   # deliberate slow pace

    print()
    ok(f"Sent {sent} SYN packets over ~{sent * 1.2:.0f}s")
    ok("Expected detection: hardware / LOW–MEDIUM risk (low pps, unusual port mix)")


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 7 — Normal Traffic (baseline / control)
# ══════════════════════════════════════════════════════════════════════════════
def scenario_normal(target, iface, count=30):
    banner("Scenario 7 — Normal Traffic (control)")
    info(f"Sending {count} normal-looking TCP connections to {target} …")
    info("This is the baseline — may not be flagged or flagged LOW")

    sent = 0
    for i in range(1, count + 1):
        port = random.choice([80, 443, 8080])
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1)
            s.connect((target, port))
            s.send(b"GET / HTTP/1.0\r\nHost: target\r\n\r\n")
            s.recv(512)
            s.close()
        except OSError:
            # Port not open — send a raw SYN/ACK-like packet
            pkt = IP(dst=target) / TCP(dport=port, flags="S")
            send(pkt, iface=iface)

        sent += 1
        progress(i, count, f"→ port {port}")
        time.sleep(random.uniform(0.3, 1.0))

    print()
    ok(f"Sent {sent} connections with normal pacing")
    ok("Expected: no detection or LOW risk (low pps, small payload, regular intervals)")


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════
SCENARIOS = {
    "sweep":   scenario_sweep,
    "scan":    scenario_scan,
    "flood":   scenario_flood,
    "udp":     scenario_udp,
    "bulk":    scenario_bulk,
    "stealth": scenario_stealth,
    "normal":  scenario_normal,
}

def main():
    parser = argparse.ArgumentParser(
        description="Shadow IT Traffic Generator — run inside Kali Linux VM",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--target",   required=True,    help="Target IP (e.g. 192.168.100.20)")
    parser.add_argument("--scenario", default="all",    help=f"Scenario to run: {', '.join(SCENARIOS)} | all")
    parser.add_argument("--iface",    default="eth0",   help="Network interface (default: eth0)")
    parser.add_argument("--delay",    type=int, default=4, help="Seconds to pause between scenarios (default: 4)")
    args = parser.parse_args()

    if not SCAPY_OK:
        err("Scapy is not installed. Run: pip install scapy")
        sys.exit(1)

    if hasattr(os, "geteuid") and os.geteuid() != 0:
        err("This script must be run as root: sudo python3 traffic_gen.py ...")
        sys.exit(1)

    # ── Header ────────────────────────────────────────────────────────────────
    print(f"\n{BOLD}{'═'*62}{RESET}")
    print(f"{BOLD}  Shadow IT Traffic Generator{RESET}")
    print(f"{BOLD}  BSc Cybersecurity FYP — UMaT{RESET}")
    print(f"{BOLD}{'═'*62}{RESET}")
    print(f"  Target    : {BOLD}{args.target}{RESET}")
    print(f"  Interface : {BOLD}{args.iface}{RESET}")
    print(f"  Scenario  : {BOLD}{args.scenario}{RESET}")
    print(f"  Started   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{BOLD}{'═'*62}{RESET}")

    # ── Select and run scenarios ──────────────────────────────────────────────
    if args.scenario == "all":
        run_list = list(SCENARIOS.keys())
    elif args.scenario in SCENARIOS:
        run_list = [args.scenario]
    else:
        err(f"Unknown scenario '{args.scenario}'. Choose from: {', '.join(SCENARIOS)} | all")
        sys.exit(1)

    results = []
    start = time.time()

    for name in run_list:
        fn = SCENARIOS[name]
        t0 = time.time()
        try:
            fn(args.target, args.iface)
            elapsed = time.time() - t0
            results.append((name, "OK", f"{elapsed:.1f}s"))
        except KeyboardInterrupt:
            warn("Interrupted — moving to next scenario")
            results.append((name, "SKIPPED", "—"))
        except Exception as exc:
            err(f"Scenario '{name}' failed: {exc}")
            results.append((name, "ERROR", str(exc)))

        if name != run_list[-1]:
            info(f"Pausing {args.delay}s before next scenario …")
            time.sleep(args.delay)

    # ── Summary ───────────────────────────────────────────────────────────────
    total = time.time() - start
    banner("Run Summary")
    print(f"  {'Scenario':<12} {'Status':<10} {'Time'}")
    print(f"  {'─'*12} {'─'*10} {'─'*8}")
    for name, status, elapsed in results:
        colour = GREEN if status == "OK" else (YELLOW if status == "SKIPPED" else RED)
        print(f"  {name:<12} {colour}{status:<10}{RESET} {elapsed}")
    print()
    print(f"  Total time : {total:.1f}s")
    print()
    print(f"  {BOLD}Next steps:{RESET}")
    print(f"  1. Go to the Live Scan page on the dashboard")
    print(f"  2. Click {BOLD}Analyze Now{RESET} to force-process all captured flows")
    print(f"  3. Click {BOLD}Save Detections{RESET} to write anomalies to the database")
    print(f"  4. Check the {BOLD}Detections{RESET} page and filter by High risk")
    print(f"  5. Click {BOLD}Export Report{RESET} on the Dashboard to generate the PDF\n")


if __name__ == "__main__":
    main()
