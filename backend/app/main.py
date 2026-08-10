"""
CarePulse AI - FastAPI backend entrypoint.

Week 1 goal: a minimal app with a health-check endpoint so we can confirm
the backend runs and both client apps can reach it, before any real
business logic (auth, patients, check-ins, risk engine) is added.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="CarePulse AI Backend",
    description=(
        "Decision-support API for hypertension medication-adherence tracking. "
        "Academic MVP - not a medical device. Does not diagnose, prescribe, "
        "or change dosages."
    ),
    version="0.1.0",
)

# Allow the web dashboard (Vite dev server) and Expo dev client to call the API
# during local development.
# TODO: narrow this list to real deployed origins before any non-local demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict:
    """
    Basic liveness check.

    Used during Week 1 integration (connecting both clients to the backend)
    to confirm the API is reachable before any real endpoints exist.
    """
    return {"status": "ok", "service": "carepulse-ai-backend"}
