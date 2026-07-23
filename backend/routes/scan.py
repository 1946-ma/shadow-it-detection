import ipaddress
import logging

from flask import Blueprint, jsonify, request, g

from backend.models.db_models import execute, insert_detections
from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required

scan_bp = Blueprint("scan", __name__)
log = logging.getLogger("shadow-it")


def _col():
    from ml.collector import get_collector, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return None, "Scapy not installed. Run: pip install scapy"
    return get_collector(), None


# ── GET /api/scan/interfaces ───────────────────────────────────────────────────
@scan_bp.route("/interfaces", methods=["GET"])
@token_required
@admin_required
def interfaces():
    from ml.collector import list_interfaces, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return jsonify({"error": "Scapy not installed"}), 503
    return jsonify({"interfaces": list_interfaces()})


# ── POST /api/scan/start ───────────────────────────────────────────────────────
@scan_bp.route("/start", methods=["POST"])
@token_required
@admin_required
def start():
    col, err = _col()
    if err:
        return jsonify({"error": err}), 503

    body  = request.get_json(silent=True) or {}
    iface = body.get("iface") or None

    ok, msg = col.start(iface=iface)
    if not ok:
        return jsonify({"error": msg}), 400

    u = g.current_user
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "SCAN_START",
         f"Live scan started — iface: {iface or 'default'}", request.remote_addr),
    )
    return jsonify({"message": msg, "status": col.status()})


# ── POST /api/scan/stop ────────────────────────────────────────────────────────
@scan_bp.route("/stop", methods=["POST"])
@token_required
@admin_required
def stop():
    col, err = _col()
    if err:
        return jsonify({"error": err}), 503

    if not col._running:
        return jsonify({"message": "No scan is running"})

    col.stop()

    u = g.current_user
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "SCAN_STOP", "Live scan stopped", request.remote_addr),
    )
    return jsonify({"message": "Scan stopped", "status": col.status()})


# ── GET /api/scan/status ───────────────────────────────────────────────────────
@scan_bp.route("/status", methods=["GET"])
@token_required
@admin_required
def status():
    col, err = _col()
    if err:
        return jsonify({"running": False, "error": err})
    return jsonify(col.status())


# ── POST /api/scan/flush ──────────────────────────────────────────────────────
@scan_bp.route("/flush", methods=["POST"])
@token_required
@admin_required
def flush():
    col, err = _col()
    if err:
        return jsonify({"error": err}), 503
    flushed = col.flush_all()
    return jsonify({"message": f"Force-flushed {flushed} flows", "flushed": flushed, "status": col.status()})


# ── GET /api/scan/detections ───────────────────────────────────────────────────
@scan_bp.route("/detections", methods=["GET"])
@token_required
@admin_required
def detections():
    col, err = _col()
    if err:
        return jsonify({"detections": [], "count": 0})

    raw = col.pop_detections()

    # One connection, one transaction — atomic (all rows or none).
    insert_detections(raw)

    return jsonify({"detections": raw, "count": len(raw)})


# ── POST /api/scan/discover ────────────────────────────────────────────────────
# ACTIVE scan: ARP-sweep the local subnet and TCP-probe each live device for
# running services. Unlike passive capture this SENDS packets to every host, so
# it is admin-only AND requires an explicit `authorized` confirmation from the
# caller. Host-only, like live capture — a Docker container can't ARP the LAN.
@scan_bp.route("/discover", methods=["POST"])
@token_required
@admin_required
def discover():
    from ml.collector import active_scan, scan_to_detections, SCAPY_AVAILABLE
    if not SCAPY_AVAILABLE:
        return jsonify({"error": "Scapy not installed — active scan unavailable"}), 503

    body       = request.get_json(silent=True) or {}
    iface_ip   = str(body.get("iface_ip", "")).strip()
    authorized = bool(body.get("authorized"))

    if not iface_ip:
        return jsonify({"error": "iface_ip is required (the local IP of the adapter to scan)"}), 400
    try:
        ipaddress.ip_address(iface_ip)          # reject junk before scapy sees it
    except ValueError:
        return jsonify({"error": "iface_ip is not a valid IPv4 address"}), 400
    if not authorized:
        return jsonify({"error": "You must confirm you are authorized to scan this network."}), 403

    try:
        results = active_scan(iface_ip, authorized=True)
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except Exception:
        log.exception("active scan failed")
        return jsonify({"error": "Network scan failed. Check server logs."}), 500

    records = scan_to_detections(results)
    if records:
        insert_detections(records)

    u      = g.current_user
    subnet = f"{iface_ip.rsplit('.', 1)[0]}.0/24"
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "NETWORK_DISCOVER",
         f"Active scan {subnet} — {len(results)} devices, {len(records)} services",
         request.remote_addr),
    )

    return jsonify({
        "devices":       results,
        "device_count":  len(results),
        "service_count": len(records),
        "saved":         len(records),
        "subnet":        subnet,
    })
