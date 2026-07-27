import logging

from flask import Blueprint, jsonify, request, g

from backend.models.db_models import execute, insert_detections
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

radius_bp = Blueprint("radius", __name__)
log = logging.getLogger("shadow-it")


# ── GET /api/radius/status ──────────────────────────────────────────────────────
# Passive check — counts currently-open RADIUS sessions, no DB writes. Lets the
# Live Scan page show RADIUS connectivity without triggering a sync.
@radius_bp.route("/status", methods=["GET"])
@token_required
@admin_required
def status():
    try:
        row = execute(
            "SELECT COUNT(*) AS open_sessions, COUNT(DISTINCT username) AS identities "
            "FROM radacct WHERE acctstoptime IS NULL",
            fetch="one",
        )
        return jsonify({
            "connected": True,
            "error": None,
            "open_sessions": row["open_sessions"] if row else 0,
            "identities": row["identities"] if row else 0,
        })
    except Exception as exc:
        log.warning("radacct unavailable: %s", exc)
        return jsonify({"connected": False, "error": str(exc), "open_sessions": 0, "identities": 0})


# ── POST /api/radius/sync ───────────────────────────────────────────────────────
# Flags any identity with 2+ open RADIUS sessions from different NAS IPs.
@radius_bp.route("/sync", methods=["POST"])
@token_required
@admin_required
def sync():
    from ml.radius import scan_concurrent_sessions

    records = scan_concurrent_sessions()
    saved = insert_detections(records) if records else 0

    u = g.current_user
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "RADIUS_SYNC",
         f"RADIUS sync — {saved} concurrent-session detection(s)", request.remote_addr),
    )

    return jsonify({"detections_saved": saved, "detections": records})
