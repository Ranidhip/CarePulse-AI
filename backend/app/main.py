"""
CarePulse AI - FastAPI backend entrypoint.

Registers the health check plus all real (Supabase-backed) API routers:
/auth (sign-in/refresh), /me (identity), /patient/* (check-ins, home,
profile, medications, BP readings, history), and /provider/* (dashboard,
priority queue, patient detail, timeline, follow-ups, alerts).

Demo routes (/demo/*, SQLite) remain available behind DEMO_MODE for the
mobile and web apps, which have not been switched over to these
production routes yet — that's Phase 5, not this phase.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, checkins, me, patient, provider
from app.core.config import get_settings
from app.core.logging import configure_logging

configure_logging()
logger = logging.getLogger("carepulse")

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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catches anything that isn't already an HTTPException/RequestValidation
    error (FastAPI keeps handling those with their real status codes —
    this only fires for genuinely unexpected failures, e.g. a Supabase
    call erroring or timing out). Previously these reached the client as
    a bare 500 with zero server-side trace; now they're logged with the
    route and full traceback before returning the same generic body a
    client should see either way (never leak internals).
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

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


@app.api_route("/health", methods=["GET", "HEAD", "POST"])
def health_check() -> dict:
    """
    Basic liveness check.

    Accepts GET/HEAD/POST (not just GET) because external uptime-monitor
    services used to keep this instance warm on Render's free tier don't
    all default to GET — one observed sending POST here got a 405 with a
    plain @app.get(), which the monitor's own dashboard then reported as
    "down" even though the app was fully healthy.
    """
    return {"status": "ok", "service": "carepulse-ai-backend"}


app.include_router(auth.router)
app.include_router(me.router)
app.include_router(checkins.router)
app.include_router(patient.router)
app.include_router(provider.router)

if settings.demo_mode:
    from app.demo.db import init_db
    from app.demo.seed import ensure_seeded
    from app.api.demo_patient import router as demo_router
    from app.api.demo_provider import router as demo_provider_router

    init_db()
    ensure_seeded()
    app.include_router(demo_router)
    app.include_router(demo_provider_router)

if settings.ai_enabled and settings.openai_api_key:
    # The openai-agents SDK's default model provider builds its own
    # AsyncOpenAI client that reads OPENAI_API_KEY from the OS
    # environment when an Agent's `model` is a plain string (see
    # app/services/agents/client.py). This app never exports backend/.env
    # into os.environ, so that default lookup always fails. Registering
    # our explicitly-keyed client here makes the agent workflow
    # (app/services/agents/orchestrator.py) actually reach OpenAI instead
    # of silently falling back on every check-in.
    from agents import set_default_openai_client

    from app.services.ai.client import get_async_openai_client

    set_default_openai_client(get_async_openai_client(), use_for_tracing=False)
