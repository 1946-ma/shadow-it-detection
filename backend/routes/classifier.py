"""
Behavioural traffic-classifier API — status + retrain.

The classifier itself lives in `ml/traffic_classifier.py` and runs inside
`detect()` (real-time, in the collector loop). This blueprint just exposes its
state and lets an admin retrain it on the accumulated bank-net samples. It never
creates detections or blocks anything — enrichment only.
"""
import logging
import os
import threading
import time

from flask import Blueprint, jsonify, request, g

from backend.middleware.jwt_auth import token_required
from backend.middleware.rbac import admin_required
from backend.models.db_models import execute

classifier_bp = Blueprint("classifier", __name__)
log = logging.getLogger("shadow-it")


# ── GET /api/classifier/status ───────────────────────────────────────────────────
# Passive — last-training summary + accumulated sample count. No writes. Used by
# the Live Scan page card.
@classifier_bp.route("/status", methods=["GET"])
@token_required
@admin_required
def status():
    from ml.traffic_classifier import load_meta, MIN_CONFIDENCE

    meta = load_meta()
    meta["min_confidence"] = MIN_CONFIDENCE
    return jsonify(meta)


# ── POST /api/classifier/retrain ─────────────────────────────────────────────────
# Refits the classifier on ml/data/traffic_samples.csv (grown by detect() during
# live capture) and hot-swaps the artifact. Audit-logged.
@classifier_bp.route("/retrain", methods=["POST"])
@token_required
@admin_required
def retrain():
    from ml.traffic_classifier import train

    try:
        meta = train()
    except ValueError as exc:
        # Not enough labelled data yet — a client error, not a crash.
        return jsonify({"trained": False, "error": str(exc)}), 400
    except Exception:
        log.exception("classifier retrain failed")
        return jsonify({"trained": False, "error": "retrain failed — see server logs"}), 500

    u = g.current_user
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (u["user_id"], "CLASSIFIER_RETRAIN",
         f"Traffic classifier retrained — {meta.get('n_samples', 0)} samples, "
         f"acc={meta.get('accuracy')}", request.remote_addr),
    )
    return jsonify(meta)


# ── Optional periodic auto-retrain ───────────────────────────────────────────────
# Off unless TRAFFIC_CLASS_RETRAIN_HOURS is a positive number. A daemon thread so
# it never blocks shutdown; failures (e.g. too few samples) are logged and skipped.
_periodic_started = False


def maybe_start_periodic_retrain() -> None:
    global _periodic_started
    if _periodic_started:
        return
    try:
        hours = float(os.getenv("TRAFFIC_CLASS_RETRAIN_HOURS", "") or 0)
    except ValueError:
        hours = 0.0
    if hours <= 0:
        return
    _periodic_started = True

    def _loop():
        from ml.traffic_classifier import train
        interval = hours * 3600
        while True:
            time.sleep(interval)
            try:
                meta = train()
                log.info("periodic classifier retrain: %s samples, acc=%s",
                         meta.get("n_samples"), meta.get("accuracy"))
            except Exception as exc:
                log.warning("periodic classifier retrain skipped: %s", exc)

    threading.Thread(target=_loop, name="classifier-retrain", daemon=True).start()
    log.info("classifier periodic retrain enabled: every %.1fh", hours)
