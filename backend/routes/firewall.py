import logging

from flask import Blueprint, jsonify, request, g

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

firewall_bp = Blueprint("firewall", __name__)
log = logging.getLogger("shadow-it")

_ALLOWED_STATUS = {"pending", "rejected", "applied", "apply_failed"}


def _serialize(row: dict) -> dict:
    r = dict(row)
    for key in ("created_at", "reviewed_at"):
        if r.get(key):
            r[key] = r[key].isoformat()
    r.pop("total_count", None)
    return r


# ── POST /api/firewall/rules/generate ───────────────────────────────────────────
# Generates a draft enforcement rule from an existing detection. Never
# executes anything — that only happens on PATCH .../approve.
@firewall_bp.route("/rules/generate", methods=["POST"])
@token_required
@admin_required
def generate():
    from ml.enforcement import generate_rule_suggestion

    body = request.get_json(silent=True) or {}
    detection_id = body.get("detection_id")
    if not detection_id:
        return jsonify({"error": "detection_id is required"}), 400

    detection = execute("SELECT * FROM detections WHERE id = %s", (detection_id,), fetch="one")
    if not detection:
        return jsonify({"error": "Detection not found"}), 404

    suggestion = generate_rule_suggestion(detection)

    u = g.current_user
    row = execute(
        """INSERT INTO firewall_rules
               (detection_id, target_ip, target_label, enforcement_kind, rule_action,
                dst_domain, rationale, command_text, suggested_by)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
           RETURNING *""",
        (detection_id, suggestion["target_ip"], suggestion["target_label"],
         suggestion["enforcement_kind"], suggestion["rule_action"], suggestion["dst_domain"],
         suggestion["rationale"], suggestion["command_text"], u["user_id"]),
        fetch="one",
    )

    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "FIREWALL_RULE_SUGGEST",
         f"Suggested {suggestion['rule_action']} rule for {suggestion['target_label']} "
         f"({suggestion['target_ip']}) from detection #{detection_id}", request.remote_addr),
    )

    return jsonify(_serialize(row)), 201


# ── GET /api/firewall/rules?status=pending&page=1&per_page=20 ───────────────────
@firewall_bp.route("/rules", methods=["GET"])
@token_required
@admin_required
def list_rules():
    status = request.args.get("status")
    if status is not None and status not in _ALLOWED_STATUS:
        return jsonify({"error": "Invalid 'status' filter"}), 400

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except ValueError:
        return jsonify({"error": "Invalid pagination parameters"}), 400

    where, params = ("WHERE status = %s", [status]) if status else ("", [])
    params += [per_page, (page - 1) * per_page]

    rows = execute(
        f"SELECT *, COUNT(*) OVER() AS total_count FROM firewall_rules {where} "
        "ORDER BY created_at DESC LIMIT %s OFFSET %s",
        params, fetch="all",
    )
    if not rows:
        return jsonify({"rules": [], "total": 0, "page": page, "per_page": per_page})

    total = int(rows[0]["total_count"])
    return jsonify({"rules": [_serialize(r) for r in rows], "total": total, "page": page, "per_page": per_page})


# ── PATCH /api/firewall/rules/<id> ──────────────────────────────────────────────
# {status: 'approved'} actually runs the command against the real target and
# records the outcome (applied | apply_failed). {status: 'rejected'} never
# executes anything — just dismisses the suggestion.
@firewall_bp.route("/rules/<int:rule_id>", methods=["PATCH"])
@token_required
@admin_required
def review(rule_id):
    body = request.get_json(silent=True) or {}
    action = body.get("status")
    if action not in ("approved", "rejected"):
        return jsonify({"error": "status must be 'approved' or 'rejected'"}), 400

    rule = execute("SELECT * FROM firewall_rules WHERE id = %s", (rule_id,), fetch="one")
    if not rule:
        return jsonify({"error": "Rule not found"}), 404
    # pending -> first review; apply_failed -> retryable (approve again) or
    # give up (reject). applied/rejected are terminal.
    if rule["status"] not in ("pending", "apply_failed"):
        return jsonify({"error": f"Rule is already {rule['status']}"}), 409

    u = g.current_user

    if action == "rejected":
        row = execute(
            "UPDATE firewall_rules SET status = 'rejected', reviewed_by = %s, reviewed_at = NOW() "
            "WHERE id = %s RETURNING *",
            (u["user_id"], rule_id), fetch="one",
        )
        execute(
            "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
            (u["user_id"], "FIREWALL_RULE_REJECT",
             f"Rejected rule #{rule_id} for {rule['target_label']} ({rule['target_ip']})",
             request.remote_addr),
        )
        return jsonify(_serialize(row))

    from ml.enforcement import apply_rule

    success, output = apply_rule(rule)
    new_status = "applied" if success else "apply_failed"
    row = execute(
        "UPDATE firewall_rules SET status = %s, execution_output = %s, "
        "reviewed_by = %s, reviewed_at = NOW() WHERE id = %s RETURNING *",
        (new_status, output, u["user_id"], rule_id), fetch="one",
    )

    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "FIREWALL_RULE_APPROVE" if success else "FIREWALL_RULE_APPLY_FAILED",
         f"{'Applied' if success else 'Failed to apply'} rule #{rule_id} for "
         f"{rule['target_label']} ({rule['target_ip']})", request.remote_addr),
    )

    return jsonify(_serialize(row))
