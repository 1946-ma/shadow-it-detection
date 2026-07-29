import uuid

import bcrypt
import pytest
from dotenv import load_dotenv

load_dotenv()

from backend.app import create_app
from backend.extensions import limiter
from backend.models.db_models import execute

STRONG_PASSWORD = "Str0ng!Passw0rd#Test"


@pytest.fixture(scope="session")
def app():
    return create_app()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def _reset_limiter():
    # Flask-Limiter's in-memory storage persists across tests in the same
    # process — reset it so one test's rate-limit hits don't bleed into the
    # next test's assertions.
    limiter.reset()
    yield


def _make_user(role: str):
    username = f"testuser_{role}_{uuid.uuid4().hex[:8]}"
    pw_hash = bcrypt.hashpw(STRONG_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    row = execute(
        "INSERT INTO users (username, password_hash, role) VALUES (%s,%s,%s) "
        "RETURNING id, username, role",
        (username, pw_hash, role), fetch="one",
    )
    return row


def _delete_user(user_id):
    # audit_logs.user_id is ON DELETE SET NULL, but audit_logs is immutable
    # (BEFORE UPDATE/DELETE trigger — see db/immutability.sql) and that
    # trigger blocks the FK's own SET NULL update too. So any user who has
    # ever logged in (creating a LOGIN audit row) can never actually be
    # DELETEd — a real, deliberate consequence of tamper-evident audit
    # logging, not a bug to route around. Ephemeral test users are therefore
    # left in place (harmless: randomly-suffixed, no PII, never the real
    # demo admin/viewer accounts) rather than force-deleted.
    execute("DELETE FROM active_sessions WHERE user_id = %s", (user_id,))


@pytest.fixture()
def test_admin():
    """An ephemeral admin user (never the real demo 'admin' account)."""
    row = _make_user("admin")
    yield {"id": row["id"], "username": row["username"], "role": row["role"],
           "password": STRONG_PASSWORD}
    _delete_user(row["id"])


@pytest.fixture()
def test_viewer():
    """An ephemeral viewer user (never the real demo 'viewer' account)."""
    row = _make_user("viewer")
    yield {"id": row["id"], "username": row["username"], "role": row["role"],
           "password": STRONG_PASSWORD}
    _delete_user(row["id"])


def login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})
