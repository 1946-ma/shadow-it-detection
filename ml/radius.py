"""
RADIUS/AAA concurrent-session ingest — network-layer identity Shadow IT.

Roadmap feature #4 (Shadow-IT-Pipeline-Flowchart, "RADIUS/AAA — INTEGRATE").
FreeRADIUS's accounting module (mods-available/sql) writes directly into the
same PostgreSQL database the detector already uses (radacct table — see
CLAUDE.md), so this is a plain SQL query, not a REST client like ml.wazuh.

Mirrors the existing app-layer concurrent-session feature
(backend/routes/auth.py._check_and_enforce_concurrency) — same identity
Shadow IT concept, sourced from network-level RADIUS logins (Wi-Fi/VPN/802.1X)
instead of dashboard JWT sessions. FreeRADIUS's own Simultaneous-Use check
already blocks a second login in real time; this catches the audit-trail
case where a concurrent session still shows up in accounting (e.g. a NAS
that doesn't enforce the check, or a session opened before the limit was
configured).
"""
from backend.models.db_models import execute


def get_concurrent_sessions() -> list[dict]:
    """
    RADIUS identities with 2+ distinct NAS-IP-Address values among currently
    open sessions (AcctStopTime IS NULL). One row per identity.
    """
    return execute(
        """
        SELECT username, array_agg(DISTINCT host(nasipaddress) ORDER BY host(nasipaddress)) AS nas_ips
        FROM radacct
        WHERE acctstoptime IS NULL AND username IS NOT NULL
        GROUP BY username
        HAVING COUNT(DISTINCT nasipaddress) > 1
        """,
        fetch="all",
    ) or []


def scan_concurrent_sessions() -> list[dict]:
    """
    Detection records (same shape as ml.model.detect() / ml.wazuh) for every
    RADIUS identity currently logged in from more than one location.
    """
    records = []
    for row in get_concurrent_sessions():
        username = row["username"]
        nas_ips = row["nas_ips"]
        records.append({
            "src_ip":           nas_ips[0],
            "src_mac":          "-",
            "dst_domain":       f"Concurrent RADIUS session: {username} ({len(nas_ips)} locations)",
            "protocol":         "RADIUS",
            "bytes_sent":       0,
            "bytes_received":   0,
            "duration":         0,
            "device_type":      "user-account",
            "shadow_it_type":   "identity",
            "risk_level":       "high",
            "anomaly_score":    0.0,
            "app_category":     "identity",
            "detection_source": "radius",
        })
    return records
