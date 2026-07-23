"""
Shadow IT Detection — Flask API entry-point
Run from shadow-it-detection/ : python backend/app.py
"""
import sys, os, logging
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, g, request
from flask_cors import CORS
from dotenv import load_dotenv

from backend.extensions import limiter

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("shadow-it")

# Allowed browser origins (comma-separated CORS_ORIGINS env overrides the
# localhost defaults for a real deployment).
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://localhost:3005"
).split(",") if o.strip()]


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, origins=CORS_ORIGINS, supports_credentials=True)
    limiter.init_app(app)

    # Ensure the token-revocation table exists (idempotent; covers existing
    # DB volumes where initdb scripts won't re-run).
    from backend.models.db_models import ensure_auth_schema
    try:
        ensure_auth_schema()
    except Exception as exc:
        log.warning("Could not ensure auth schema at startup: %s", exc)

    from backend.routes.auth       import auth_bp
    from backend.routes.detections import detections_bp
    from backend.routes.stats      import stats_bp
    from backend.routes.audit      import audit_bp
    from backend.routes.metrics    import metrics_bp
    from backend.routes.scan       import scan_bp
    from backend.routes.report     import report_bp

    app.register_blueprint(auth_bp,       url_prefix="/api/auth")
    app.register_blueprint(detections_bp, url_prefix="/api/detections")
    app.register_blueprint(stats_bp,      url_prefix="/api/stats")
    app.register_blueprint(audit_bp,      url_prefix="/api/audit-logs")
    app.register_blueprint(metrics_bp,    url_prefix="/api/metrics")
    app.register_blueprint(scan_bp,       url_prefix="/api/scan")
    app.register_blueprint(report_bp,     url_prefix="/api/report")

    # ── POST /api/run-detection  (admin only) ──────────────────────────────────
    from backend.middleware.jwt_auth import token_required
    from backend.middleware.rbac     import admin_required
    from backend.models.db_models    import execute, insert_detections

    @app.route("/api/run-detection", methods=["POST"])
    @token_required
    @admin_required
    def run_detection():
        try:
            import pandas as pd
            from ml.model       import detect
            from ml.load_cicids import load_fast

            df               = load_fast(nrows_per_file=300)
            results, elapsed = detect(df)

            # One connection, one transaction — atomic (all rows or none).
            inserted = insert_detections(results)

            u = g.current_user
            execute(
                "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
                (u["user_id"], "RUN_DETECTION",
                 f"Ran detection: {inserted} anomalies", request.remote_addr),
            )

            return jsonify({
                "message":         f"Detection complete. {inserted} anomalies saved.",
                "anomaly_count":   inserted,
                "elapsed_seconds": round(elapsed, 3),
            })
        except FileNotFoundError:
            return jsonify({"error": "Dataset not found. Run ml/generate_dataset.py first."}), 500
        except Exception:
            # Log the detail server-side; never leak internals to the client.
            log.exception("run-detection failed")
            return jsonify({"error": "Detection failed. Please check server logs."}), 500

    # ── Health check ───────────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "Shadow IT Detection API"})

    # ── Generic error handler — never leak stack traces / internals ─────────────
    @app.errorhandler(Exception)
    def _handle_error(exc):
        from werkzeug.exceptions import HTTPException
        if isinstance(exc, HTTPException):
            return jsonify({"error": exc.description}), exc.code
        log.exception("Unhandled error")
        return jsonify({"error": "Internal server error"}), 500

    return app


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    # Debug must be opted into explicitly (FLASK_DEBUG=true) — the Werkzeug
    # debugger allows remote code execution if reachable, so it must never
    # default on. Production runs under gunicorn and never hits this path.
    debug = os.getenv("FLASK_DEBUG", "false").lower() in ("1", "true")
    # threaded=True so the live-capture background threads (Scapy sniff/flush) can't
    # starve HTTP request handling — the single-threaded dev server would otherwise
    # hang the API under heavy Wi-Fi traffic. (Production runs under gunicorn.)
    create_app().run(host="0.0.0.0", port=port, debug=debug, threaded=True)
