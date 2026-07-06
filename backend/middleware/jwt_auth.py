import os
from functools import wraps
import jwt
from flask import request, jsonify, g
from dotenv import load_dotenv

from backend.models.db_models import execute

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "change-me")


def _extract_token():
    """Prefer the HttpOnly cookie (not readable by JS — XSS-safe); fall back
    to the Authorization header for API clients / curl / tests."""
    cookie = request.cookies.get("token")
    if cookie:
        return cookie
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1]
    return None


def _is_revoked(jti: str) -> bool:
    if not jti:
        return False
    row = execute("SELECT 1 AS x FROM token_denylist WHERE jti = %s", (jti,), fetch="one")
    return row is not None


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "Authorization token missing"}), 401
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        if _is_revoked(payload.get("jti")):
            return jsonify({"error": "Token has been revoked. Please log in again."}), 401

        g.current_user = {
            "user_id":  payload["user_id"],
            "username": payload["username"],
            "role":     payload["role"],
            "jti":      payload.get("jti"),
            "exp":      payload.get("exp"),
        }
        return f(*args, **kwargs)
    return decorated
