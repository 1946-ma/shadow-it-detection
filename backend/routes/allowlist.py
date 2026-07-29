"""
Sanctioned-services allowlist API — the "Approve" counterpart to the firewall
Block flow (backend/routes/firewall.py).

Sanctioning a service today (ml/model.py:is_sanctioned()) means its hostname
is listed in ml/sanctioned_services.txt — previously a manual file edit only
(see CLAUDE.md "Live Capture"). This blueprint lets an admin do the same thing
from the dashboard for a specific detection: append its dst_domain and resolve
it. It never touches the firewall_rules/enforcement path — approving a service
and blocking one are deliberately separate mechanisms.
"""
import logging
import os
import re

from flask import Blueprint, jsonify, request, g

from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required
from backend.models.db_models import execute

allowlist_bp = Blueprint("allowlist", __name__)
log = logging.getLogger("shadow-it")

ALLOWLIST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "ml", "sanctioned_services.txt")

# A raw IP (or an IP embedded as CATALOG_LABEL (1.2.3.4)) can't be sanctioned —
# is_sanctioned() only ever matches hostnames. Extract a bare hostname out of
# dst_domain, which may be "hostname", "App Name (hostname)", or a raw IP.
_HOSTNAME_RE = re.compile(r"([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}")


def _extract_domain(dst_domain: str) -> str | None:
    if not dst_domain:
        return None
    m = _HOSTNAME_RE.search(dst_domain)
    return m.group(0).lower() if m else None


@allowlist_bp.route("/add", methods=["POST"])
@token_required
@admin_required
def add():
    body = request.get_json(silent=True) or {}
    detection_id = body.get("detection_id")
    if not detection_id:
        return jsonify({"error": "detection_id is required"}), 400

    detection = execute("SELECT * FROM detections WHERE id = %s", (detection_id,), fetch="one")
    if not detection:
        return jsonify({"error": "Detection not found"}), 404

    domain = _extract_domain(detection.get("dst_domain"))
    if not domain:
        return jsonify({"error": "This detection has no resolvable hostname to sanction (raw IP destinations can't be allowlisted)"}), 400

    try:
        existing = set()
        if os.path.exists(ALLOWLIST_PATH):
            with open(ALLOWLIST_PATH, encoding="utf-8") as f:
                existing = {line.split("#", 1)[0].strip().lower() for line in f if line.split("#", 1)[0].strip()}
        if domain not in existing:
            with open(ALLOWLIST_PATH, "a", encoding="utf-8") as f:
                f.write(f"{domain}\n")
    except OSError:
        log.exception("allowlist write failed")
        return jsonify({"error": "Could not update the allowlist — see server logs"}), 500

    execute("UPDATE detections SET is_resolved = TRUE WHERE id = %s", (detection_id,))

    u = g.current_user
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "ALLOWLIST_ADD",
         f"Sanctioned '{domain}' from detection #{detection_id}", request.remote_addr),
    )

    return jsonify({"domain": domain, "detection_id": detection_id, "resolved": True})
