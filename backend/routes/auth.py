import os
import uuid
import datetime
import bcrypt
import jwt
from flask import Blueprint, request, jsonify, g, make_response
from dotenv import load_dotenv

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required
from backend.extensions import limiter

load_dotenv()

auth_bp = Blueprint("auth", __name__)

JWT_SECRET      = os.getenv("JWT_SECRET", "change-me")
JWT_EXPIRY_HRS  = int(os.getenv("JWT_EXPIRY_HOURS", 8))

# Cookie flags. COOKIE_SECURE=true once served over HTTPS (see deploy/ TLS
# proxy); left false by default so http://localhost works in every browser.
COOKIE_SECURE   = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "Lax")


def _audit(user_id, action, target, ip):
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (user_id, action, target, ip),
    )


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
    payload = {
        "user_id":  user["id"],
        "username": user["username"],
        "role":     user["role"],
        "jti":      uuid.uuid4().hex,   # unique id so this token can be revoked
        "exp":      exp,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    _audit(user["id"], "LOGIN", f"User {username} logged in", request.remote_addr)

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

    _audit(u["user_id"], "LOGOUT", f"User {u['username']} logged out", request.remote_addr)

    resp = make_response(jsonify({"message": "Logged out successfully"}))
    resp.delete_cookie("token", path="/")
    return resp
