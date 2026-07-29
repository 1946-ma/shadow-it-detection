import time

import jwt as pyjwt

from backend.extensions import JWT_SECRET
from backend.models.db_models import execute
from backend.tests.conftest import STRONG_PASSWORD, login


# ── Login ────────────────────────────────────────────────────────────────────

def test_login_success(client, test_viewer):
    res = login(client, test_viewer["username"], test_viewer["password"])
    assert res.status_code == 200
    assert res.json["user"]["role"] == "viewer"
    assert res.json["user"]["username"] == test_viewer["username"]


def test_login_wrong_password(client, test_viewer):
    res = login(client, test_viewer["username"], "not-the-password")
    assert res.status_code == 401
    assert res.json == {"error": "Invalid credentials"}


def test_login_wrong_username(client):
    res = login(client, "no-such-user-xyz", "whatever")
    assert res.status_code == 401
    # Same body as a wrong password — no user-enumeration signal.
    assert res.json == {"error": "Invalid credentials"}


# ── JWT validity ─────────────────────────────────────────────────────────────

def test_protected_route_rejects_invalid_token(client):
    res = client.post("/api/auth/logout", headers={"Authorization": "Bearer not-a-real-token"})
    assert res.status_code == 401
    assert res.json == {"error": "Invalid token"}


def test_protected_route_rejects_expired_token(client, test_viewer):
    expired = pyjwt.encode(
        {"user_id": test_viewer["id"], "username": test_viewer["username"],
         "role": "viewer", "jti": "expired-jti", "exp": int(time.time()) - 60},
        JWT_SECRET, algorithm="HS256",
    )
    res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401
    assert res.json == {"error": "Token expired. Please log in again."}


# ── RBAC ─────────────────────────────────────────────────────────────────────

def test_rbac_403_for_viewer_on_admin_route(client, test_viewer):
    login(client, test_viewer["username"], test_viewer["password"])
    res = client.post("/api/auth/users", json={
        "username": "should-not-be-created", "password": STRONG_PASSWORD, "role": "viewer",
    })
    assert res.status_code == 403
    assert res.json == {"error": "Admin privileges required"}


# ── Rate limiting ────────────────────────────────────────────────────────────

def test_rate_limit_by_ip(client):
    last = None
    for _ in range(6):
        last = login(client, "irrelevant-user", "wrong-password")
    assert last.status_code == 429


def test_rate_limit_by_username(client):
    # Same username, different simulated source IP each time — isolates the
    # per-username limiter from the per-IP one.
    username = "same-username-every-time"
    last = None
    for i in range(6):
        last = client.post(
            "/api/auth/login", json={"username": username, "password": "wrong-password"},
            environ_overrides={"REMOTE_ADDR": f"10.0.0.{i}"},
        )
    assert last.status_code == 429


# ── Admin create-user ────────────────────────────────────────────────────────

def test_create_user_weak_password_400(client, test_admin):
    login(client, test_admin["username"], test_admin["password"])
    res = client.post("/api/auth/users", json={
        "username": "wontbecreated", "password": "password", "role": "viewer",
    })
    assert res.status_code == 400
    assert res.json["details"]


def test_create_user_success(client, test_admin):
    login(client, test_admin["username"], test_admin["password"])
    username = f"created_{test_admin['id']}"
    res = client.post("/api/auth/users", json={
        "username": username, "password": STRONG_PASSWORD, "role": "viewer",
    })
    try:
        assert res.status_code == 201
        assert res.json["username"] == username
        assert res.json["role"] == "viewer"
        assert "password_hash" not in res.json

        row = execute("SELECT id, role FROM users WHERE username = %s", (username,), fetch="one")
        assert row is not None
        assert row["role"] == "viewer"
    finally:
        execute("DELETE FROM users WHERE username = %s", (username,))


def test_create_user_duplicate_username_409(client, test_admin):
    login(client, test_admin["username"], test_admin["password"])
    username = f"dupe_{test_admin['id']}"
    body = {"username": username, "password": STRONG_PASSWORD, "role": "viewer"}
    try:
        first = client.post("/api/auth/users", json=body)
        assert first.status_code == 201
        second = client.post("/api/auth/users", json=body)
        assert second.status_code == 409
        assert second.json == {"error": "Username already exists"}
    finally:
        execute("DELETE FROM users WHERE username = %s", (username,))


# ── Change password ──────────────────────────────────────────────────────────

def test_change_password_weak_new_password_400(client, test_viewer):
    login(client, test_viewer["username"], test_viewer["password"])
    res = client.post("/api/auth/change-password", json={
        "old_password": test_viewer["password"], "new_password": "weak",
    })
    assert res.status_code == 400
    assert res.json["details"]


def test_change_password_wrong_old_password_401(client, test_viewer):
    login(client, test_viewer["username"], test_viewer["password"])
    res = client.post("/api/auth/change-password", json={
        "old_password": "not-the-real-password", "new_password": "AnotherStr0ng!Passw0rd#",
    })
    assert res.status_code == 401


def test_change_password_success(client, test_viewer):
    login_res = login(client, test_viewer["username"], test_viewer["password"])
    old_token = login_res.json["token"]
    new_password = "BrandNewStr0ng!Passw0rd#"

    res = client.post("/api/auth/change-password", json={
        "old_password": test_viewer["password"], "new_password": new_password,
    })
    assert res.status_code == 200

    # Old JWT is not force-revoked — still authenticates until natural expiry.
    still_valid = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {old_token}"})
    assert still_valid.status_code == 200

    # Fresh login: new password works, old password no longer does.
    assert login(client, test_viewer["username"], new_password).status_code == 200
    assert login(client, test_viewer["username"], test_viewer["password"]).status_code == 401
