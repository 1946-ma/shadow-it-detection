from flask import Blueprint, request, jsonify

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

audit_bp = Blueprint("audit", __name__)

VERIFY_SQL = """
WITH all_entries AS (
    SELECT id, entry_hash, user_id, action, target, ip_address, timestamp
    FROM   audit_logs
    ORDER  BY id
),
chain AS (
    SELECT
        id, entry_hash, user_id, action, target, ip_address, timestamp,
        COALESCE(LAG(entry_hash) OVER (ORDER BY id), repeat('0', 64)) AS prev_hash
    FROM all_entries
),
recomputed AS (
    SELECT
        id, entry_hash,
        encode(digest(
            user_id::TEXT                   || '|' ||
            action                          || '|' ||
            COALESCE(target,     '')        || '|' ||
            COALESCE(ip_address, '')        || '|' ||
            timestamp::TEXT                 || '|' ||
            prev_hash,
            'sha256'
        ), 'hex') AS expected_hash
    FROM chain
    WHERE entry_hash IS NOT NULL
)
SELECT id FROM recomputed WHERE entry_hash <> expected_hash
"""


@audit_bp.route("", methods=["GET"])
@token_required
@admin_required
def list_audit_logs():
    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    offset   = (page - 1) * per_page

    rows = execute(
        """SELECT al.id, al.action, al.target, al.ip_address, al.timestamp,
                  u.username
           FROM audit_logs al
           LEFT JOIN users u ON al.user_id = u.id
           ORDER BY al.timestamp DESC
           LIMIT %s OFFSET %s""",
        (per_page, offset), fetch="all",
    ) or []

    total = execute("SELECT COUNT(*) AS c FROM audit_logs", fetch="one")["c"]

    logs = []
    for r in rows:
        d = dict(r)
        if d.get("timestamp"):
            d["timestamp"] = d["timestamp"].isoformat()
        logs.append(d)

    return jsonify({"logs": logs, "total": total, "page": page, "per_page": per_page})


@audit_bp.route("/verify", methods=["GET"])
@token_required
@admin_required
def verify_chain():
    total_row    = execute("SELECT COUNT(*) AS c FROM audit_logs", fetch="one")
    hashed_row   = execute("SELECT COUNT(*) AS c FROM audit_logs WHERE entry_hash IS NOT NULL", fetch="one")
    broken_rows  = execute(VERIFY_SQL, fetch="all") or []

    total_entries  = int(total_row["c"])
    hashed_entries = int(hashed_row["c"])
    legacy_entries = total_entries - hashed_entries
    broken_ids     = [r["id"] for r in broken_rows]

    if broken_ids:
        return jsonify({
            "status":          "compromised",
            "broken_ids":      broken_ids,
            "hashed_entries":  hashed_entries,
            "legacy_entries":  legacy_entries,
        })

    return jsonify({
        "status":          "ok",
        "hashed_entries":  hashed_entries,
        "legacy_entries":  legacy_entries,
        "total_entries":   total_entries,
    })
