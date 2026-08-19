"""
Authentication helpers.

Trust boundary note (see docs/02-auth-design.md §3): the backend connects to
Supabase with the secret key, which BYPASSES Row-Level Security entirely.
That means Postgres RLS is a defense-in-depth backstop, not the primary
access control for anything going through this API — this module (and the
role dependencies in app/api/deps.py) is where access is actually enforced.

Phase 2 addition: get_anon_supabase_client(). Real user sign-in/refresh
(app/api/auth.py) must authenticate against Supabase Auth using the ANON
key, never the service-role key — the service-role key bypasses every
Supabase Auth safeguard and must never be used to check a user's password.
The service-role client remains what every route uses afterward to read
and write data.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from app.core.config import get_settings
from app.core.db import one_or_none

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)


def get_supabase_client() -> Client:
    """
    Returns a Supabase client authenticated with the backend's secret key.

    This client can read/write any row — RLS does not apply to it. Only
    ever use it from trusted backend code; never return it or its key to
    a client app. Declared as a plain function (not only usable via
    FastAPI's Depends) so scripts can call it directly, but every route
    should take it as `Depends(get_supabase_client)` rather than calling
    it inline — that's what lets tests override it with a fake client.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_anon_supabase_client() -> Client:
    """
    Returns a Supabase client authenticated with the ANON key — the same
    trust level a mobile/web client would have. Used ONLY by
    app/api/auth.py to verify a user's email/password against Supabase
    Auth and to refresh a session. Never used for any other query: it
    still respects RLS, so it must never be used to read or write
    application data on a user's behalf from the backend.
    """
    return create_client(settings.supabase_url, settings.supabase_anon_key)


class CurrentUser:
    """Represents the authenticated caller for the duration of one request."""

    def __init__(self, id: str, email: str, role: str, is_active: bool):
        self.id = id
        self.email = email
        self.role = role
        self.is_active = is_active


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    """
    Validates the bearer token against Supabase Auth, then loads the
    matching row from public.users for role and active status.

    Raises 401 if the token is missing/invalid/expired, 403 if the
    account has been deactivated.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token"
        )

    token = credentials.credentials
    supabase = get_supabase_client()

    try:
        auth_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    auth_user = getattr(auth_response, "user", None)
    if auth_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    # maybe_single()/single() are never used in this codebase — see
    # app/core/db.py for why. one_or_none() below handles a user with no
    # matching public.users row cleanly, falling through to the 401
    # below, without risking the crash .maybe_single() caused elsewhere.
    row = one_or_none(
        supabase.table("users").select("id, email, role, is_active").eq("id", auth_user.id)
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="No matching account record"
        )

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated"
        )

    return CurrentUser(
        id=row["id"], email=row["email"], role=row["role"], is_active=row["is_active"]
    )
