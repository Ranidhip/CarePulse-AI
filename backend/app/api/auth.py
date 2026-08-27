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

from app.core.config import get_settings
from app.core.db import one_or_none
from app.core.security import get_anon_supabase_client, get_supabase_client
from app.models.auth import (
    ForgotPasswordRequest,
    MeProfile,
    MessageResponse,
    PatientSignUpRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SessionResponse,
    SignInRequest,
)

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


@router.post(
    "/auth/sign-up", response_model=SessionResponse, status_code=status.HTTP_201_CREATED
)
def patient_sign_up(
    body: PatientSignUpRequest,
    anon_client: Client = Depends(get_anon_supabase_client),
    service_client: Client = Depends(get_supabase_client),
):
    """
    Self-service patient registration — the real signup flow the mobile
    app's Sign In screen previously had no way to reach (new patients
    could only be provisioned by an operator running
    backend/scripts/add_synthetic_patient.py).

    Uses auth.admin.create_user(email_confirm=True) via the SERVICE-role
    client (never exposed to the app itself — this endpoint is the
    trusted intermediary), the same way the seeding scripts do, rather
    than the anon client's own sign_up(). This prototype has no outbound
    email delivery, so the anon client's normal "confirm via emailed
    link" flow would leave a new patient permanently unable to sign in;
    admin-creating with email_confirm=True sidesteps that entirely so
    signing up and then immediately signing in both actually work.

    New patients are auto-assigned to SEED_PROVIDER_EMAIL's provider —
    this is a single-clinic prototype with one real provider account, not
    a multi-clinic registration flow with a provider picker.
    """
    settings = get_settings()

    try:
        created = service_client.auth.admin.create_user(
            {"email": body.email, "password": body.password, "email_confirm": True}
        )
    except Exception as e:
        if "already" in str(e).lower() or "registered" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists — sign in instead.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create this account."
        )
    auth_user = created.user

    service_client.table("users").insert(
        {"id": auth_user.id, "email": body.email, "role": "patient"}
    ).execute()

    patient_profile = (
        service_client.table("patient_profiles")
        .insert(
            {
                "user_id": auth_user.id,
                "full_name": body.full_name,
                "age": body.age,
                "contact_number": body.contact_number,
            }
        )
        .execute()
    )
    patient_profile_id = patient_profile.data[0]["id"]

    if settings.seed_provider_email:
        provider_user_row = one_or_none(
            service_client.table("users")
            .select("id")
            .eq("email", settings.seed_provider_email)
            .eq("role", "provider")
        )
        if provider_user_row is not None:
            provider_profile_row = one_or_none(
                service_client.table("provider_profiles")
                .select("id")
                .eq("user_id", provider_user_row["id"])
            )
            if provider_profile_row is not None:
                service_client.table("patient_provider_assignments").insert(
                    {
                        "patient_id": patient_profile_id,
                        "provider_id": provider_profile_row["id"],
                        "is_active": True,
                    }
                ).execute()

    # Sign the new patient straight in, the same way /auth/sign-in does,
    # so submitting the sign-up form takes them directly into the app
    # rather than back to a sign-in screen they'd have to fill in again.
    result = anon_client.auth.sign_in_with_password(
        {"email": body.email, "password": body.password}
    )
    profile = _load_active_profile(service_client, auth_user.id)
    return _session_response(result.session, profile)


@router.post("/auth/forgot-password", response_model=MessageResponse)
def forgot_password(
    body: ForgotPasswordRequest,
    anon_client: Client = Depends(get_anon_supabase_client),
):
    """
    Triggers Supabase Auth's own password-recovery email — this backend
    sends no email itself. Uses the anon client, matching sign_in()'s
    rule above: never the service-role key for anything that touches
    Supabase Auth's password/token machinery.

    Always returns the same generic message whether or not the email
    matches a real account, same "never reveal whether the email exists"
    rule sign_in() follows for 401s — a failure here (bad email, or
    Supabase Auth erroring) is deliberately swallowed rather than
    distinguished in the response. Whether the recipient actually
    receives an email depends on this Supabase project's own email
    sending being configured; this endpoint has no way to detect or
    report that from here.
    """
    settings = get_settings()
    redirect_to = f"{settings.web_app_url.rstrip('/')}/provider/reset-password"
    try:
        anon_client.auth.reset_password_for_email(body.email, {"redirect_to": redirect_to})
    except Exception:
        pass
    return MessageResponse(
        message="If an account exists for that email, a password reset link has been sent."
    )


@router.post("/auth/reset-password", response_model=MessageResponse)
def reset_password(
    body: ResetPasswordRequest,
    service_client: Client = Depends(get_supabase_client),
):
    """
    Completes the password-recovery flow started by POST
    /auth/forgot-password: verifies the short-lived recovery access token
    Supabase emailed the user — the same supabase.auth.get_user() check
    get_current_user() uses (see core/security.py) — then sets the new
    password via the service-role admin API, which is the only way to
    change a user's password without their current one. The recovery
    token is single-purpose and time-limited; it is never stored or
    treated as an ordinary session token beyond this one verification.
    """
    try:
        auth_response = service_client.auth.get_user(body.access_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This reset link is invalid or has expired. Request a new one.",
        )
    auth_user = getattr(auth_response, "user", None)
    if auth_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This reset link is invalid or has expired. Request a new one.",
        )

    service_client.auth.admin.update_user_by_id(auth_user.id, {"password": body.new_password})
    return MessageResponse(
        message="Your password has been updated. Sign in with your new password."
    )


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
