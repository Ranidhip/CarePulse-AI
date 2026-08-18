"""
CarePulse AI - FastAPI backend entrypoint.

Registers the health check plus the real API routers: /me (identity) and
/patient/check-ins (the core tracer-bullet route: submit -> rule engine ->
store -> respond). More routers get added here as each domain is built.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import checkins, me
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
    """
    return {"status": "ok", "service": "carepulse-ai-backend"}


app.include_router(me.router)
app.include_router(checkins.router)

if settings.demo_mode:
    from app.demo.db import init_db
    from app.demo.seed import ensure_seeded
    from app.api.demo_patient import router as demo_router
    from app.api.demo_provider import router as demo_provider_router

    init_db()
    ensure_seeded()
    app.include_router(demo_router)
    app.include_router(demo_provider_router)