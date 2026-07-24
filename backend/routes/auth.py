import os
import uuid
import logging
import datetime
import bcrypt
import jwt
from flask import Blueprint, request, jsonify, g, make_response
from dotenv import load_dotenv

from backend.models.db_models import execute, insert_detections
from backend.middleware.jwt_auth import token_required
from backend.extensions import limiter, JWT_SECRET

load_dotenv()

log = logging.getLogger("shadow-it")

auth_bp = Blueprint("auth", __name__)

JWT_EXPIRY_HRS  = int(os.getenv("JWT_EXPIRY_HOURS", 8))

# Cookie flags. COOKIE_SECURE=true once served over HTTPS (see deploy/ TLS
# proxy); left false by default so http://localhost works in every browser.
COOKIE_SECURE   = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "Lax")

# Concurrent-session (identity Shadow IT) detection. Flag when one account is
# active from more than N distinct IPs at once; enforce by revoking the oldest
# sessions until the count is back within the limit.
CONCURRENT_SESSION_MAX_IPS = int(os.getenv("CONCURRENT_SESSION_MAX_IPS", 2))
CONCURRENT_SESSION_ENFORCE = os.getenv("CONCURRENT_SESSION_ENFORCE", "true").lower() == "true"


def _audit(user_id, action, target, ip):
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (user_id, action, target, ip),
    )


# ── Concurrent-session tracking ────────────────────────────────────────────────
# All helpers fail OPEN: if active_sessions doesn't exist yet (DB predates the
# migration), they log and no-op so login/logout still work. Same pattern as
# jwt_auth._is_revoked().

def _record_session(jti, user_id, username, ip, user_agent, exp_epoch):
    """Record a freshly issued session (one row per JWT)."""
    try:
        execute(
            "INSERT INTO active_sessions "
            "(jti, user_id, username, ip_address, user_agent, expires_at) "
            "VALUES (%s,%s,%s,%s,%s, to_timestamp(%s)) ON CONFLICT (jti) DO NOTHING",
            (jti, user_id, username, ip, (user_agent or "")[:500], exp_epoch),
        )
    except Exception as exc:
        log.warning("active_sessions unavailable (record): %s", exc)


def _end_session(jti):
    """Drop a session on logout, plus opportunistic expired-row cleanup."""
    try:
        execute("DELETE FROM active_sessions WHERE jti = %s", (jti,))
        execute("DELETE FROM active_sessions WHERE expires_at < NOW()")
    except Exception as exc:
        log.warning("active_sessions unavailable (end): %s", exc)


def _check_and_enforce_concurrency(user_id, username, ip):
    """Flag + (optionally) enforce the concurrent-session limit. Fail-open."""
    try:
        rows = execute(
            "SELECT jti, ip_address, expires_at FROM active_sessions "
            "WHERE user_id = %s AND expires_at > NOW() "
            "AND jti NOT IN (SELECT jti FROM token_denylist) "
            "ORDER BY issued_at DESC",
            (user_id,), fetch="all",
        ) or []
    except Exception as exc:
        log.warning("active_sessions unavailable (check): %s", exc)
        return

    distinct_ips = {r["ip_address"] for r in rows}
    if len(distinct_ips) <= CONCURRENT_SESSION_MAX_IPS:
        return

    n = len(distinct_ips)
    # Record a Shadow IT detection so it surfaces on the Alerts dashboard.
    insert_detections([{
        "src_ip":           ip,
        "src_mac":          "-",
        "dst_domain":       f"Concurrent session: {username} ({n} locations)",
        "protocol":         "HTTP",
        "bytes_sent":       0,
        "bytes_received":   0,
        "duration":         0,
        "device_type":      "user-account",
        "shadow_it_type":   "identity",
        "risk_level":       "high",
        "anomaly_score":    0.0,
        "app_category":     "identity",
        "detection_source": "concurrent-session",
    }])

    # Enforce: keep the sessions of the N most-recent distinct IPs, revoke the
    # rest (oldest extra locations) via the existing token_denylist path.
    revoked = 0
    if CONCURRENT_SESSION_ENFORCE:
        kept_ips, to_revoke = [], []
        for r in rows:                              # newest first
            rip = r["ip_address"]
            if rip in kept_ips:
                continue                            # same location — keep
            if len(kept_ips) < CONCURRENT_SESSION_MAX_IPS:
                kept_ips.append(rip)                # new location within limit
            else:
                to_revoke.append(r)                 # extra older location — revoke
        for r in to_revoke:
            try:
                execute(
                    "INSERT INTO token_denylist (jti, expires_at) VALUES (%s, %s) "
                    "ON CONFLICT (jti) DO NOTHING",
                    (r["jti"], r["expires_at"]),
                )
                execute("DELETE FROM active_sessions WHERE jti = %s", (r["jti"],))
                revoked += 1
            except Exception as exc:
                log.warning("failed to revoke session %s: %s", r["jti"], exc)

    _audit(user_id, "CONCURRENT_SESSION",
           f"{username}: active from {n} IPs (limit {CONCURRENT_SESSION_MAX_IPS}); "
           f"{revoked} older session(s) revoked", ip)


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per minute")   # throttle brute-force / credential stuffing
def login():
    body     = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    user = execute(
        "SELECT id, username, password_hash, role FROM users WHERE username = %s",
        (username,), fetch="one",
    )
    # Always run through the same failure path (no user-vs-password
    # distinction) to avoid leaking which usernames exist.
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Invalid credentials"}), 401

    exp = datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HRS)
    jti = uuid.uuid4().hex          # unique id so this token can be revoked
    payload = {
        "user_id":  user["id"],
        "username": user["username"],
        "role":     user["role"],
        "jti":      jti,
        "exp":      exp,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    _audit(user["id"], "LOGIN", f"User {username} logged in", request.remote_addr)

    # Track the session, then flag/enforce concurrent-session (identity Shadow IT).
    exp_epoch = int(exp.replace(tzinfo=datetime.timezone.utc).timestamp())
    _record_session(jti, user["id"], user["username"], request.remote_addr,
                    request.headers.get("User-Agent"), exp_epoch)
    _check_and_enforce_concurrency(user["id"], user["username"], request.remote_addr)

    resp = make_response(jsonify({
        "token": token,   # kept for API clients; browser uses the cookie below
        "user": {"id": user["id"], "username": user["username"], "role": user["role"]},
    }))
    # HttpOnly so JavaScript (and therefore XSS) cannot read the token.
    resp.set_cookie(
        "token", token,
        httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        max_age=JWT_EXPIRY_HRS * 3600, path="/",
    )
    return resp


@auth_bp.route("/logout", methods=["POST"])
@token_required
def logout():
    u = g.current_user
    # Revoke this token so it cannot be reused before its natural expiry.
    if u.get("jti") and u.get("exp"):
        execute(
            "INSERT INTO token_denylist (jti, expires_at) VALUES (%s, to_timestamp(%s)) "
            "ON CONFLICT (jti) DO NOTHING",
            (u["jti"], u["exp"]),
        )
        # opportunistic cleanup of expired denylist rows
        execute("DELETE FROM token_denylist WHERE expires_at < NOW()")

    # Drop the live session record (+ expired-row cleanup).
    if u.get("jti"):
        _end_session(u["jti"])

    _audit(u["user_id"], "LOGOUT", f"User {u['username']} logged out", request.remote_addr)

    resp = make_response(jsonify({"message": "Logged out successfully"}))
    resp.delete_cookie("token", path="/")
    return resp
