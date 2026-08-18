"""
Demo-mode authentication. This is intentionally NOT the real auth path —
app.core.security remains the production implementation, untouched.

The "access token" here is simply the patient_id or provider_id itself,
returned on sign-in and sent back as a bearer token on later requests.
This is sufficient and appropriate for an isolated, clearly-labelled demo
dataset containing only fictional data — it is never used for the
production Supabase-backed routes.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.demo import repository

demo_bearer_scheme = HTTPBearer(auto_error=False)


def get_demo_current_patient(
    credentials: HTTPAuthorizationCredentials | None = Depends(demo_bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing demo bearer token"
        )
    patient = repository.get_patient(credentials.credentials)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid demo session"
        )
    return patient


def get_demo_current_provider(
    credentials: HTTPAuthorizationCredentials | None = Depends(demo_bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing demo bearer token"
        )
    provider = repository.get_provider(credentials.credentials)
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid demo session"
        )
    return provider
