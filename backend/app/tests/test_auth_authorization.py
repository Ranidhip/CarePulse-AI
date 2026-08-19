"""
Authentication and authorization tests.

These test the security-boundary logic in isolation, without a live
Supabase connection — matching the existing project convention (see
test_deps.py's own note: "without calling Supabase Auth over the
network"). Two mocking techniques are used, matched to how each piece of
code actually gets its Supabase client:

  1. Routes that take `supabase: Client = Depends(get_supabase_client)`
     (every Phase 2 route) are overridden via app.dependency_overrides —
     the standard, supported FastAPI testing pattern.
  2. app.core.security.get_current_user() calls get_supabase_client()
     directly inside its body (not via Depends), specifically so it can
     be used as a dependency itself — for THAT one function, tests
     monkeypatch app.core.security.get_supabase_client instead.

A minimal fake Supabase client/query builder is defined below rather than
imported from a library — it only implements the handful of chained
methods (.select/.eq/.neq/.in_/.order/.limit/.execute) that the routes
under test actually call. It deliberately does NOT implement
.single()/.maybe_single() — production code no longer calls them (see
app/core/db.py), and test_db_helpers.py separately pins the exact
zero-row behavior that made .maybe_single() unsafe in the first place.

Scope note: these tests cover the authentication/authorization matrix
explicitly required for Phase 2 (missing token, invalid/expired token,
deactivated account, role separation, assignment enforcement). They do
NOT attempt to verify patient/provider route *business logic* (e.g. that
the priority queue sorts correctly) against a fake database — that would
mean re-implementing Supabase's query semantics in the fake just to test
against it, which doesn't actually verify anything about the real
project. That verification has to happen against the real Supabase
project (see backend/scripts/check_db_readiness.py and manual testing
via scripts/get_access_token.py), which this sandbox has no access to.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.core.security as security_module
from app.api.deps import require_assigned_patient
from app.core.security import CurrentUser, get_current_user, get_supabase_client
from app.main import app

client = TestClient(app)


# --- Minimal fake Supabase client -----------------------------------------


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    """
    Mirrors what production code actually calls now: .limit(1).execute(),
    via app.core.db.one_or_none() — never .maybe_single()/.single(). See
    test_db_helpers.py for the regression test on one_or_none() itself
    and app/core/db.py for why .maybe_single() was removed entirely.
    """

    def __init__(self, rows):
        self._rows = list(rows)
        self._predicates = []
        self._limit = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, col, val):
        self._predicates.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def neq(self, col, val):
        self._predicates.append(lambda r, c=col, v=val: r.get(c) != v)
        return self

    def in_(self, col, values):
        self._predicates.append(lambda r, c=col, vs=values: r.get(c) in vs)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        matches = [r for r in self._rows if all(p(r) for p in self._predicates)]
        if self._limit is not None:
            matches = matches[: self._limit]
        return FakeResult(matches)


class FakeAuth:
    """Fakes the .auth.get_user() call used only by get_current_user()."""

    def __init__(self, user_id: str | None = None, should_raise: bool = False):
        self._user_id = user_id
        self._should_raise = should_raise

    def get_user(self, _token):
        if self._should_raise:
            raise Exception("Simulated invalid/expired token")
        return SimpleNamespace(user=SimpleNamespace(id=self._user_id))


class FakeSupabaseClient:
    def __init__(self, tables: dict[str, list[dict]] | None = None, auth: FakeAuth | None = None):
        self._tables = tables or {}
        self.auth = auth or FakeAuth()

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self._tables.get(name, []))


@pytest.fixture(autouse=True)
def _clear_overrides():
    """Every test starts and ends with a clean dependency_overrides dict."""
    yield
    app.dependency_overrides.clear()


def make_user(role: str, is_active: bool = True, id: str = "test-user-id") -> CurrentUser:
    return CurrentUser(id=id, email="test@example.com", role=role, is_active=is_active)


# --- Missing / invalid / expired token -------------------------------------


def test_missing_token_returns_401():
    response = client.get("/me")
    assert response.status_code == 401


def test_invalid_or_expired_token_returns_401(monkeypatch):
    fake_client = FakeSupabaseClient(auth=FakeAuth(should_raise=True))
    monkeypatch.setattr(security_module, "get_supabase_client", lambda: fake_client)

    response = client.get("/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_token_with_no_matching_account_returns_401(monkeypatch):
    # Auth succeeds, but there's no public.users row for this id — e.g. a
    # Supabase Auth user that was never fully provisioned.
    fake_client = FakeSupabaseClient(
        tables={"users": []}, auth=FakeAuth(user_id="orphaned-auth-id")
    )
    monkeypatch.setattr(security_module, "get_supabase_client", lambda: fake_client)

    response = client.get("/me", headers={"Authorization": "Bearer some-token"})
    assert response.status_code == 401


def test_deactivated_user_receives_403(monkeypatch):
    fake_client = FakeSupabaseClient(
        tables={
            "users": [
                {"id": "deactivated-id", "email": "gone@example.com", "role": "patient", "is_active": False}
            ]
        },
        auth=FakeAuth(user_id="deactivated-id"),
    )
    monkeypatch.setattr(security_module, "get_supabase_client", lambda: fake_client)

    response = client.get("/me", headers={"Authorization": "Bearer some-token"})
    assert response.status_code == 403


# --- Role separation ---------------------------------------------------


def test_patient_cannot_call_provider_routes():
    app.dependency_overrides[get_current_user] = lambda: make_user("patient")
    response = client.get("/provider/patients")
    assert response.status_code == 403


def test_provider_cannot_call_patient_routes():
    app.dependency_overrides[get_current_user] = lambda: make_user("provider")
    response = client.get("/patient/home")
    assert response.status_code == 403


# --- Active-assignment authorization -------------------------------------


PROVIDER_USER_ID = "provider-auth-user-1"
PROVIDER_PROFILE_ID = "provider-profile-1"
ASSIGNED_PATIENT_ID = "patient-profile-assigned"
UNASSIGNED_PATIENT_ID = "patient-profile-unassigned"


def _provider_fake_client(*, with_assignment: bool) -> FakeSupabaseClient:
    assignments = (
        [
            {
                "id": "assignment-1",
                "provider_id": PROVIDER_PROFILE_ID,
                "patient_id": ASSIGNED_PATIENT_ID,
                "is_active": True,
            }
        ]
        if with_assignment
        else []
    )
    return FakeSupabaseClient(
        tables={
            "provider_profiles": [{"id": PROVIDER_PROFILE_ID, "user_id": PROVIDER_USER_ID}],
            "patient_provider_assignments": assignments,
            "patient_profiles": [
                {
                    "id": ASSIGNED_PATIENT_ID,
                    "full_name": "Test Patient",
                    "age": 50,
                    "contact_number": None,
                }
            ],
            # Everything else (medications, bp readings, check-ins,
            # alerts, follow-ups) legitimately has no rows for this
            # patient in this test — the route must handle that gracefully.
        }
    )


def test_provider_cannot_access_unassigned_patient():
    app.dependency_overrides[get_current_user] = lambda: make_user("provider", id=PROVIDER_USER_ID)
    app.dependency_overrides[get_supabase_client] = lambda: _provider_fake_client(
        with_assignment=False
    )

    response = client.get(f"/provider/patients/{UNASSIGNED_PATIENT_ID}")
    assert response.status_code == 404


def test_assigned_provider_can_access_patient():
    app.dependency_overrides[get_current_user] = lambda: make_user("provider", id=PROVIDER_USER_ID)
    app.dependency_overrides[get_supabase_client] = lambda: _provider_fake_client(
        with_assignment=True
    )

    response = client.get(f"/provider/patients/{ASSIGNED_PATIENT_ID}")
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["id"] == ASSIGNED_PATIENT_ID
    assert body["latest_check_in"] is None  # no check-ins seeded for this patient
    assert body["open_alerts"] == []


def test_require_assigned_patient_dependency_directly():
    """
    Unit-level check of the dependency itself (independent of any
    specific route), mirroring the style of the existing require_role
    tests in test_deps.py.
    """
    fake_client = _provider_fake_client(with_assignment=True)
    result = require_assigned_patient(
        patient_id=ASSIGNED_PATIENT_ID,
        user=make_user("provider", is_active=True, id=PROVIDER_USER_ID),
        supabase=fake_client,
    )
    assert result.provider_profile_id == PROVIDER_PROFILE_ID
    assert result.patient_id == ASSIGNED_PATIENT_ID


# --- Sign-in ---------------------------------------------------------------


class FakeSession:
    access_token = "fake-access-token"
    refresh_token = "fake-refresh-token"
    expires_in = 3600
    expires_at = 9999999999
    token_type = "bearer"


class FakeAnonAuth:
    def __init__(self, should_fail: bool = False, user_id: str = "auth-user-1"):
        self._should_fail = should_fail
        self._user_id = user_id

    def sign_in_with_password(self, _payload):
        if self._should_fail:
            raise Exception("Invalid login credentials")
        return SimpleNamespace(session=FakeSession(), user=SimpleNamespace(id=self._user_id))

    def refresh_session(self, _token):
        return self.sign_in_with_password({})


class FakeAnonClient:
    def __init__(self, auth: FakeAnonAuth):
        self.auth = auth


def test_sign_in_with_invalid_credentials_returns_401():
    from app.core.security import get_anon_supabase_client

    app.dependency_overrides[get_anon_supabase_client] = lambda: FakeAnonClient(
        FakeAnonAuth(should_fail=True)
    )
    app.dependency_overrides[get_supabase_client] = lambda: FakeSupabaseClient()

    response = client.post(
        "/auth/sign-in", json={"email": "nobody@example.com", "password": "wrong"}
    )
    assert response.status_code == 401


def test_sign_in_with_valid_credentials_returns_session():
    from app.core.security import get_anon_supabase_client

    app.dependency_overrides[get_anon_supabase_client] = lambda: FakeAnonClient(FakeAnonAuth())
    app.dependency_overrides[get_supabase_client] = lambda: FakeSupabaseClient(
        tables={
            "users": [
                {
                    "id": "auth-user-1",
                    "email": "patient@example.com",
                    "role": "patient",
                    "is_active": True,
                }
            ]
        }
    )

    response = client.post(
        "/auth/sign-in", json={"email": "patient@example.com", "password": "correct"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "fake-access-token"
    assert body["user"]["role"] == "patient"


def test_sign_in_rejects_deactivated_account():
    from app.core.security import get_anon_supabase_client

    app.dependency_overrides[get_anon_supabase_client] = lambda: FakeAnonClient(FakeAnonAuth())
    app.dependency_overrides[get_supabase_client] = lambda: FakeSupabaseClient(
        tables={
            "users": [
                {
                    "id": "auth-user-1",
                    "email": "patient@example.com",
                    "role": "patient",
                    "is_active": False,
                }
            ]
        }
    )

    response = client.post(
        "/auth/sign-in", json={"email": "patient@example.com", "password": "correct"}
    )
    assert response.status_code == 403
