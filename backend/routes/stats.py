from flask import Blueprint, jsonify

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("", methods=["GET"])
@token_required
def get_stats():
    total    = execute("SELECT COUNT(*) AS c FROM detections", fetch="one")["c"]
    resolved = execute("SELECT COUNT(*) AS c FROM detections WHERE is_resolved", fetch="one")["c"]

    by_type = execute(
        "SELECT shadow_it_type, COUNT(*) AS c FROM detections GROUP BY shadow_it_type",
        fetch="all",
    ) or []
    by_risk = execute(
        "SELECT risk_level, COUNT(*) AS c FROM detections GROUP BY risk_level",
        fetch="all",
    ) or []

    recent = execute(
        "SELECT id, src_ip, dst_domain, shadow_it_type, risk_level, detected_at, is_resolved "
        "FROM detections ORDER BY detected_at DESC LIMIT 10",
        fetch="all",
    ) or []

    alerts = []
    for r in recent:
        d = dict(r)
        if d.get("detected_at"):
            d["detected_at"] = d["detected_at"].isoformat()
        alerts.append(d)

    return jsonify({
        "total_detections": total,
        "resolved":         resolved,
        "unresolved":       total - resolved,
        "by_type":          {r["shadow_it_type"]: r["c"] for r in by_type},
        "by_risk":          {r["risk_level"]: r["c"] for r in by_risk},
        "recent_alerts":    alerts,
    })
