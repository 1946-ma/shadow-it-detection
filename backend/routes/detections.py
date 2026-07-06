import sys, os, csv, io
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from flask import Blueprint, request, jsonify, g, Response

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

detections_bp = Blueprint("detections", __name__)


class _BadParam(Exception):
    pass


def _valid_date(value, name):
    """Accept an ISO date/datetime string; raise _BadParam otherwise.
    Prevents malformed input from reaching the query as a 500."""
    if value is None:
        return None
    try:
        datetime.fromisoformat(value)
        return value
    except (ValueError, TypeError):
        raise _BadParam(f"Invalid '{name}' — expected ISO date (YYYY-MM-DD)")


# Whitelist filter values so only known-good tokens reach the query.
_ALLOWED_RISK = {"high", "medium", "low"}
_ALLOWED_TYPE = {"software", "hardware", "mixed", "none"}


def _parse_filters(args):
    risk = args.get("risk")
    if risk is not None and risk not in _ALLOWED_RISK:
        raise _BadParam("Invalid 'risk' filter")
    stype = args.get("type")
    if stype is not None and stype not in _ALLOWED_TYPE:
        raise _BadParam("Invalid 'type' filter")
    return {
        "type":      stype,
        "risk":      risk,
        "date_from": _valid_date(args.get("date_from"), "date_from"),
        "date_to":   _valid_date(args.get("date_to"), "date_to"),
    }


def _audit(user_id, action, target, ip):
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (user_id, action, target, ip),
    )


def _serialize(row: dict) -> dict:
    r = dict(row)
    if r.get("detected_at"):
        r["detected_at"] = r["detected_at"].isoformat()
    r.pop("total_count", None)
    return r


@detections_bp.route("", methods=["GET"])
@token_required
def list_detections():
    try:
        f = _parse_filters(request.args)
        page     = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except (_BadParam, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    shadow_type, risk_level = f["type"], f["risk"]
    date_from, date_to      = f["date_from"], f["date_to"]

    conds, params = [], []
    if shadow_type:
        conds.append("shadow_it_type = %s"); params.append(shadow_type)
    if risk_level:
        conds.append("risk_level = %s"); params.append(risk_level)
    if date_from:
        conds.append("detected_at >= %s"); params.append(date_from)
    if date_to:
        conds.append("detected_at <= %s"); params.append(date_to)

    where  = ("WHERE " + " AND ".join(conds)) if conds else ""
    offset = (page - 1) * per_page
    params += [per_page, offset]

    rows = execute(
        f"SELECT *, COUNT(*) OVER() AS total_count FROM detections {where} "
        "ORDER BY detected_at DESC LIMIT %s OFFSET %s",
        params, fetch="all",
    )
    if not rows:
        return jsonify({"detections": [], "total": 0, "page": page, "per_page": per_page})

    total      = int(rows[0]["total_count"])
    detections = [_serialize(r) for r in rows]
    return jsonify({"detections": detections, "total": total, "page": page, "per_page": per_page})


@detections_bp.route("/export", methods=["GET"])
@token_required
def export_detections():
    try:
        f = _parse_filters(request.args)
    except (_BadParam, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    shadow_type, risk_level = f["type"], f["risk"]
    date_from, date_to      = f["date_from"], f["date_to"]

    conds, params = [], []
    if shadow_type:
        conds.append("shadow_it_type = %s"); params.append(shadow_type)
    if risk_level:
        conds.append("risk_level = %s"); params.append(risk_level)
    if date_from:
        conds.append("detected_at >= %s"); params.append(date_from)
    if date_to:
        conds.append("detected_at <= %s"); params.append(date_to)

    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    rows = execute(
        f"SELECT id, src_ip, src_mac, dst_domain, protocol, bytes_sent, bytes_received, "
        f"duration, device_type, shadow_it_type, risk_level, anomaly_score, is_resolved, detected_at "
        f"FROM detections {where} ORDER BY detected_at DESC",
        params, fetch="all",
    ) or []

    fields = ["id", "src_ip", "src_mac", "dst_domain", "protocol", "bytes_sent",
              "bytes_received", "duration", "device_type", "shadow_it_type",
              "risk_level", "anomaly_score", "is_resolved", "detected_at"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        d = dict(r)
        if d.get("detected_at"):
            d["detected_at"] = d["detected_at"].isoformat()
        writer.writerow(d)

    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=detections.csv"},
    )


@detections_bp.route("/<int:did>", methods=["GET"])
@token_required
def get_detection(did):
    row = execute("SELECT * FROM detections WHERE id = %s", (did,), fetch="one")
    if not row:
        return jsonify({"error": "Detection not found"}), 404
    return jsonify(_serialize(dict(row)))


@detections_bp.route("/<int:did>/resolve", methods=["PATCH"])
@token_required
@admin_required
def resolve_detection(did):
    existing = execute("SELECT id FROM detections WHERE id = %s", (did,), fetch="one")
    if not existing:
        return jsonify({"error": "Detection not found"}), 404
    execute("UPDATE detections SET is_resolved = TRUE WHERE id = %s", (did,))
    u = g.current_user
    _audit(u["user_id"], "RESOLVE_DETECTION", f"Detection #{did}", request.remote_addr)
    return jsonify({"message": f"Detection {did} marked as resolved"})
