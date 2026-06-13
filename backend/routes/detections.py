import sys, os, csv, io
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from flask import Blueprint, request, jsonify, g, Response

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

detections_bp = Blueprint("detections", __name__)


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
    shadow_type = request.args.get("type")
    risk_level  = request.args.get("risk")
    date_from   = request.args.get("date_from")
    date_to     = request.args.get("date_to")
    page        = max(1, int(request.args.get("page", 1)))
    per_page    = min(100, max(1, int(request.args.get("per_page", 20))))

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
    shadow_type = request.args.get("type")
    risk_level  = request.args.get("risk")
    date_from   = request.args.get("date_from")
    date_to     = request.args.get("date_to")

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
