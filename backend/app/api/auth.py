"""
Real Supabase Auth endpoints.

POST /auth/sign-in verifies an email/password against Supabase Auth using
the ANON client (never the service-role key — see core/security.py) and
returns a real access/refresh token pair. POST /auth/refresh exchanges a
refresh token for a new pair the same way.

After sign-in, every subsequent request authenticates itself by sending
the access token as a bearer header to whichever route it's calling —
this router does not issue any session of its own kind, it's a thin,
faithful wrapper around Supabase Auth.

Deactivated accounts (public.users.is_active = false) are rejected here
too, with 403, even though Supabase Auth itself has no concept of that
flag — it's an application-level rule, not a Supabase Auth rule.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.db import one_or_none
from app.core.security import get_anon_supabase_client, get_supabase_client
from app.models.auth import MeProfile, RefreshRequest, SessionResponse, SignInRequest

router = APIRouter(tags=["auth"])


def _load_active_profile(service_client: Client, user_id: str) -> MeProfile:
    """
    Loads the public.users row for a successfully-authenticated Supabase
    Auth user and enforces the is_active flag. Raises 403 (not 401) for a
    deactivated account — the credentials were correct, the account is
    just not allowed to use them right now.
    """
    row = one_or_none(
        service_client.table("users").select("id, email, role, is_active").eq("id", user_id)
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No matching account record",
        )
    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated"
        )
    return MeProfile(id=row["id"], email=row["email"], role=row["role"], is_active=row["is_active"])


def _session_response(session, user_profile: MeProfile) -> SessionResponse:
    return SessionResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        token_type=getattr(session, "token_type", "bearer"),
        expires_in=getattr(session, "expires_in", 0),
        expires_at=getattr(session, "expires_at", None),
        user=user_profile,
    )


@router.post("/auth/sign-in", response_model=SessionResponse)
def sign_in(
    body: SignInRequest,
    anon_client: Client = Depends(get_anon_supabase_client),
    service_client: Client = Depends(get_supabase_client),
):
    try:
        result = anon_client.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception:
        # Deliberately generic: never reveal whether the email exists.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    session = getattr(result, "session", None)
    auth_user = getattr(result, "user", None)
    if session is None or auth_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    profile = _load_active_profile(service_client, auth_user.id)
    return _session_response(session, profile)


@router.post("/auth/refresh", response_model=SessionResponse)
def refresh(
    body: RefreshRequest,
    anon_client: Client = Depends(get_anon_supabase_client),
    service_client: Client = Depends(get_supabase_client),
):
    try:
        result = anon_client.auth.refresh_session(body.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
        )

    session = getattr(result, "session", None)
    auth_user = getattr(result, "user", None)
    if session is None or auth_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
        )

    profile = _load_active_profile(service_client, auth_user.id)
    return _session_response(session, profile)
