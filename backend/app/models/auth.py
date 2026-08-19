"""
Request/response models for POST /auth/sign-in and POST /auth/refresh.
"""

from pydantic import BaseModel, Field


class SignInRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


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
