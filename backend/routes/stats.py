from flask import Blueprint, jsonify, request

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


@stats_bp.route("/timeline", methods=["GET"])
@token_required
def get_timeline():
    days = max(1, min(90, int(request.args.get("days", 30))))
    rows = execute(
        """SELECT DATE(detected_at) AS day, COUNT(*) AS c
           FROM detections
           WHERE detected_at >= NOW() - (INTERVAL '1 day' * %s)
           GROUP BY DATE(detected_at)
           ORDER BY day""",
        (days,), fetch="all",
    ) or []
    return jsonify([{"day": str(r["day"]), "count": int(r["c"])} for r in rows])


@stats_bp.route("/alerts", methods=["GET"])
@token_required
def get_alert_count():
    row = execute(
        "SELECT COUNT(*) AS c FROM detections WHERE risk_level = 'high' AND is_resolved = FALSE",
        fetch="one",
    )
    return jsonify({"high_unresolved": int(row["c"])})


@stats_bp.route("/top-offenders", methods=["GET"])
@token_required
def get_top_offenders():
    limit = min(10, max(1, int(request.args.get("limit", 10))))
    rows = execute(
        """SELECT src_ip,
                  COUNT(*)                                                    AS total,
                  SUM(CASE WHEN risk_level  = 'high'   THEN 1 ELSE 0 END)   AS high_count,
                  SUM(CASE WHEN risk_level  = 'medium' THEN 1 ELSE 0 END)   AS medium_count,
                  SUM(CASE WHEN risk_level  = 'low'    THEN 1 ELSE 0 END)   AS low_count,
                  SUM(CASE WHEN is_resolved = FALSE     THEN 1 ELSE 0 END)   AS open_count,
                  MAX(detected_at)                                            AS last_seen
           FROM detections
           GROUP BY src_ip
           ORDER BY total DESC
           LIMIT %s""",
        (limit,), fetch="all",
    ) or []

    result = []
    for r in rows:
        d = dict(r)
        if d.get("last_seen"):
            d["last_seen"] = d["last_seen"].isoformat()
        for key in ("total", "high_count", "medium_count", "low_count", "open_count"):
            d[key] = int(d[key])
        result.append(d)

    return jsonify(result)
