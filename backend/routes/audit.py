from flask import Blueprint, request, jsonify

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

audit_bp = Blueprint("audit", __name__)


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
