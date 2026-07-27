"""
Wazuh Syscollector ingest — software-inventory Shadow IT source.

Feature #3 on the roadmap (Shadow-IT-Pipeline-Flowchart): Wazuh agents on the
Windows endpoints (support-ws, employee-ws) inventory installed software via
Syscollector. This module queries the Wazuh manager's REST API for each
connected agent's package list, flags anything matching the unsanctioned SaaS
catalog (ml/saas_catalog.csv) BY APP NAME rather than by network destination,
and returns records in the same shape ml.model.detect() produces so they can
be inserted through the existing insert_detections() path.

This is a *software-presence* signal — complementary to the network-flow
catalog match in ml.model.detect(): a remote-access tool can be caught here
even if the detector never captures its traffic (e.g. it hasn't phoned home
yet, or the flow fell outside a capture window).
"""
import os
import re

import requests
import urllib3

from ml.model import load_saas_catalog

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

WAZUH_API_URL      = os.environ.get("WAZUH_API_URL", "https://192.168.137.40:55000")
WAZUH_API_USER     = os.environ.get("WAZUH_API_USER", "wazuh")
WAZUH_API_PASSWORD = os.environ.get("WAZUH_API_PASSWORD", "wazuh")
_TIMEOUT = 10


def _authenticate() -> str:
    resp = requests.post(
        f"{WAZUH_API_URL}/security/user/authenticate",
        auth=(WAZUH_API_USER, WAZUH_API_PASSWORD),
        verify=False, timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["data"]["token"]


def _get_agents(token: str) -> list[dict]:
    resp = requests.get(
        f"{WAZUH_API_URL}/agents",
        headers={"Authorization": f"Bearer {token}"},
        params={"select": "id,name,ip,status"},
        verify=False, timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    items = resp.json()["data"]["affected_items"]
    return [a for a in items if a["id"] != "000"]  # exclude the manager's own entry


def _get_packages(token: str, agent_id: str) -> list[dict]:
    resp = requests.get(
        f"{WAZUH_API_URL}/syscollector/{agent_id}/packages",
        headers={"Authorization": f"Bearer {token}"},
        params={"limit": 500},
        verify=False, timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["data"]["affected_items"]


def _catalog_by_app_name() -> dict[str, dict]:
    """app_name (lowercased) → {app_name, category, risk, domain} — the same
    catalog ml.model.detect() matches network flows against, re-indexed by
    the human app name since installed-software entries have no hostname."""
    by_name: dict[str, dict] = {}
    for domain, meta in load_saas_catalog().items():
        by_name[meta["app_name"].lower()] = {**meta, "domain": domain}
    return by_name


def get_status() -> dict:
    """
    Lightweight connectivity check — authenticates and lists agents without
    pulling Syscollector data. Used by the Live Scan page to show Wazuh's
    connection state passively (i.e. without triggering a full sync).
    """
    try:
        token = _authenticate()
        agents = _get_agents(token)
    except requests.RequestException as exc:
        return {"connected": False, "error": f"Could not reach Wazuh manager: {exc}", "agents": []}

    return {
        "connected": True,
        "error": None,
        "agents": [
            {"id": a["id"], "name": a.get("name"), "ip": a.get("ip"), "status": a.get("status")}
            for a in agents
        ],
    }


def scan_installed_software() -> tuple[list[dict], int, list[str]]:
    """
    Query every connected Wazuh agent's Syscollector package list and flag
    installed software matching the unsanctioned SaaS catalog by name.

    Returns (records, agents_scanned, errors). `records` are dicts shaped for
    backend.models.db_models.insert_detections().
    """
    errors: list[str] = []
    try:
        token = _authenticate()
        agents = _get_agents(token)
    except requests.RequestException as exc:
        return [], 0, [f"Could not reach Wazuh manager: {exc}"]

    catalog_by_name = _catalog_by_app_name()
    records: list[dict] = []
    scanned = 0

    for agent in agents:
        if agent.get("status") != "active":
            continue
        try:
            packages = _get_packages(token, agent["id"])
        except requests.RequestException as exc:
            errors.append(f"{agent.get('name', agent['id'])}: {exc}")
            continue
        scanned += 1

        seen_apps: set[str] = set()
        for pkg in packages:
            name = (pkg.get("name") or "").strip()
            if not name:
                continue
            name_lower = name.lower()
            # Word-boundary match, not a bare substring — otherwise short app
            # names false-positive constantly ("Xbox Game Bar" ~ "Box",
            # "Microsoft Store" ~ "Tor").
            match = next(
                (meta for app_name, meta in catalog_by_name.items()
                 if re.search(rf"\b{re.escape(app_name)}\b", name_lower)),
                None,
            )
            if not match or match["app_name"] in seen_apps:
                continue  # one detection per matched app per agent, not per package row
            seen_apps.add(match["app_name"])

            records.append({
                "src_ip":           agent.get("ip") or "unknown",
                "src_mac":          "Wazuh",
                "dst_domain":       f"{match['app_name']} (installed software)",
                "protocol":         "N/A",
                "bytes_sent":       0,
                "bytes_received":   0,
                "duration":         0,
                "device_type":      agent.get("name", "unknown"),
                "shadow_it_type":   "software",
                "risk_level":       match["risk"],
                "anomaly_score":    0.0,
                "app_category":     match["category"],
                "detection_source": "wazuh",
            })

    return records, scanned, errors
