"""Shared Flask extensions (initialised in app.create_app)."""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# In-memory storage is per-process — with multiple gunicorn workers the
# effective limit is (limit x workers). Fine for this project; point
# storage_uri at Redis for a hard cluster-wide limit in production.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://",
    default_limits=[],
)
