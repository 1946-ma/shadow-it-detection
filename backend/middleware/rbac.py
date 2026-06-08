from functools import wraps
from flask import jsonify, g


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = getattr(g, "current_user", None)
        if not user or user.get("role") != "admin":
            return jsonify({"error": "Admin privileges required"}), 403
        return f(*args, **kwargs)
    return decorated
