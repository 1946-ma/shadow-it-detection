"""Shared Flask extensions (initialised in app.create_app)."""
import os
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

load_dotenv()

# Refuse to start without a real secret — a fallback value would let anyone
# who reads the source forge admin tokens.
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET environment variable is required — refusing to start "
        "with a forgeable secret. Set it in .env or the environment."
    )

# In-memory storage is per-process — with multiple gunicorn workers the
# effective limit is (limit x workers). Fine for this project; point
# storage_uri at Redis for a hard cluster-wide limit in production.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://",
    default_limits=[],
)
