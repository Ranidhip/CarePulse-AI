"""
Tests for POST /auth/forgot-password and POST /auth/reset-password.

Minimal fakes for exactly the three Supabase Auth calls these two routes
make (anon_client.auth.reset_password_for_email, service_client.auth.
get_user, service_client.auth.admin.update_user_by_id) — no real Supabase
or network calls, matching the rest of this test suite's convention (see
test_auth_authorization.py's own docstring).
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.security import get_anon_supabase_client, get_supabase_client
from app.main import app

client = TestClient(app)


class FakeAnonAuth:
    def __init__(self, should_raise: bool = False):
        self._should_raise = should_raise
        self.calls: list[tuple[str, dict | None]] = []

    def reset_password_for_email(self, email: str, options: dict | None = None):
        self.calls.append((email, options))
        if self._should_raise:
            raise Exception("Simulated Supabase Auth failure")


class FakeAnonClient:
    def __init__(self, auth: FakeAnonAuth):
        self.auth = auth


class FakeAdminAuth:
    def __init__(self):
        self.updates: list[tuple[str, dict]] = []

    def update_user_by_id(self, user_id: str, attrs: dict):
        self.updates.append((user_id, attrs))
        return SimpleNamespace(user=SimpleNamespace(id=user_id))


class FakeServiceAuth:
    def __init__(self, user_id: str | None = "user-1", should_raise: bool = False):
        self._user_id = user_id
        self._should_raise = should_raise
        self.admin = FakeAdminAuth()

    def get_user(self, _token: str):
        if self._should_raise:
            raise Exception("Simulated invalid/expired recovery token")
        if self._user_id is None:
            return SimpleNamespace(user=None)
        return SimpleNamespace(user=SimpleNamespace(id=self._user_id))


class FakeServiceClient:
    def __init__(self, auth: FakeServiceAuth):
        self.auth = auth


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# --- POST /auth/forgot-password --------------------------------------------


def test_forgot_password_sends_reset_email_with_web_app_redirect():
    fake_auth = FakeAnonAuth()
    app.dependency_overrides[get_anon_supabase_client] = lambda: FakeAnonClient(fake_auth)

    response = client.post("/auth/forgot-password", json={"email": "provider@example.com"})

    assert response.status_code == 200
    assert "password reset link has been sent" in response.json()["message"]
    assert fake_auth.calls == [
        ("provider@example.com", {"redirect_to": "http://localhost:5173/provider/reset-password"})
    ]


def test_forgot_password_returns_same_generic_message_on_supabase_error():
    """
    Never reveals whether the failure was a nonexistent email vs. a real
    backend problem — same "generic response either way" rule sign_in()
    follows for invalid credentials.
    """
    fake_auth = FakeAnonAuth(should_raise=True)
    app.dependency_overrides[get_anon_supabase_client] = lambda: FakeAnonClient(fake_auth)

    response = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})

    assert response.status_code == 200
    assert "password reset link has been sent" in response.json()["message"]


def test_forgot_password_rejects_missing_email():
    app.dependency_overrides[get_anon_supabase_client] = lambda: FakeAnonClient(FakeAnonAuth())
    response = client.post("/auth/forgot-password", json={"email": ""})
    assert response.status_code == 422


# --- POST /auth/reset-password ----------------------------------------------


def test_reset_password_with_valid_token_updates_the_password():
    fake_auth = FakeServiceAuth(user_id="user-1")
    app.dependency_overrides[get_supabase_client] = lambda: FakeServiceClient(fake_auth)

    response = client.post(
        "/auth/reset-password",
        json={"access_token": "valid-recovery-token", "new_password": "new-secure-password"},
    )

    assert response.status_code == 200
    assert fake_auth.admin.updates == [("user-1", {"password": "new-secure-password"})]


def test_reset_password_with_invalid_or_expired_token_returns_401():
    fake_auth = FakeServiceAuth(should_raise=True)
    app.dependency_overrides[get_supabase_client] = lambda: FakeServiceClient(fake_auth)

    response = client.post(
        "/auth/reset-password",
        json={"access_token": "bad-token", "new_password": "new-secure-password"},
    )

    assert response.status_code == 401
    assert fake_auth.admin.updates == []


def test_reset_password_with_no_matching_user_returns_401():
    fake_auth = FakeServiceAuth(user_id=None)
    app.dependency_overrides[get_supabase_client] = lambda: FakeServiceClient(fake_auth)

    response = client.post(
        "/auth/reset-password",
        json={"access_token": "some-token", "new_password": "new-secure-password"},
    )

    assert response.status_code == 401
    assert fake_auth.admin.updates == []


def test_reset_password_rejects_a_too_short_new_password():
    app.dependency_overrides[get_supabase_client] = lambda: FakeServiceClient(FakeServiceAuth())

    response = client.post(
        "/auth/reset-password",
        json={"access_token": "some-token", "new_password": "short"},
    )

    assert response.status_code == 422
