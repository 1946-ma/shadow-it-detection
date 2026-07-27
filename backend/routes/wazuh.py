import logging

from flask import Blueprint, jsonify, request, g

from backend.models.db_models import execute, insert_detections
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

wazuh_bp = Blueprint("wazuh", __name__)
log = logging.getLogger("shadow-it")


# ── GET /api/wazuh/status ───────────────────────────────────────────────────────
# Passive connectivity check — no Syscollector pull, no DB writes. Called on
# Live Scan page load so Wazuh's connection state is visible without needing
# to trigger a full sync.
@wazuh_bp.route("/status", methods=["GET"])
@token_required
@admin_required
def status():
    from ml.wazuh import get_status
    return jsonify(get_status())


# ── POST /api/wazuh/sync ────────────────────────────────────────────────────────
# Pulls installed-software inventory from every connected Wazuh agent and saves
# any unsanctioned-catalog match as a detection (detection_source='wazuh').
@wazuh_bp.route("/sync", methods=["POST"])
@token_required
@admin_required
def sync():
    from ml.wazuh import scan_installed_software

    records, agents_scanned, errors = scan_installed_software()
    saved = insert_detections(records) if records else 0

    u = g.current_user
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "WAZUH_SYNC",
         f"Wazuh sync — {agents_scanned} agents scanned, {saved} unsanctioned software detections",
         request.remote_addr),
    )

    return jsonify({
        "agents_scanned": agents_scanned,
        "detections_saved": saved,
        "detections": records,
        "errors": errors,
    })
