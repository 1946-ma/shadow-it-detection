import os
import datetime
import bcrypt
import jwt
from flask import Blueprint, request, jsonify, g
from dotenv import load_dotenv

from backend.models.db_models import execute
from backend.middleware.jwt_auth import token_required

load_dotenv()

auth_bp = Blueprint("auth", __name__)

JWT_SECRET      = os.getenv("JWT_SECRET", "change-me")
JWT_EXPIRY_HRS  = int(os.getenv("JWT_EXPIRY_HOURS", 8))


def _audit(user_id, action, target, ip):
    execute(
        "INSERT INTO audit_logs (user_id, action, target, ip_address) VALUES (%s,%s,%s,%s)",
        (user_id, action, target, ip),
    )


@auth_bp.route("/login", methods=["POST"])
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
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Invalid credentials"}), 401

    payload = {
        "user_id":  user["id"],
        "username": user["username"],
        "role":     user["role"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HRS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    _audit(user["id"], "LOGIN", f"User {username} logged in", request.remote_addr)

    return jsonify({
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "role": user["role"]},
    })


@auth_bp.route("/logout", methods=["POST"])
@token_required
def logout():
    u = g.current_user
    _audit(u["user_id"], "LOGOUT", f"User {u['username']} logged out", request.remote_addr)
    return jsonify({"message": "Logged out successfully"})
