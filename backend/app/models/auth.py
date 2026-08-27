"""
Request/response models for POST /auth/sign-in and POST /auth/refresh.
"""

from pydantic import BaseModel, Field


class SignInRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class PatientSignUpRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=200)
    full_name: str = Field(..., min_length=1, max_length=200)
    age: int | None = Field(default=None, ge=0, le=130)
    contact_number: str | None = Field(default=None, max_length=30)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=1)


class ResetPasswordRequest(BaseModel):
    # The short-lived recovery access token Supabase Auth's password-reset
    # email links back with — not a normal session access token, and
    # never treated as one (see POST /auth/reset-password).
    access_token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=200)


class MessageResponse(BaseModel):
    message: str


class MeProfile(BaseModel):
    id: str
    email: str
    role: str
    is_active: bool


class SessionResponse(BaseModel):
    """
    Returned by both /auth/sign-in and /auth/refresh. Field names match
    what Supabase Auth itself returns (access_token / refresh_token /
    expires_in / expires_at / token_type) so the mobile/web clients can
    store the session with minimal translation.
    """

    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    expires_at: int | None
    user: MeProfile
