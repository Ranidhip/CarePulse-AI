"""
Application configuration.

Reads settings from environment variables (see backend/.env.example).
Never hardcode secrets here — this file only defines which variables are
expected and their local-development defaults.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # General
    environment: str = "development"

    # Demo mode — isolated SQLite data layer (backend/demo_data.sqlite3),
    # used only while the real Supabase seeding blocker is unresolved.
    # Never affects production routes, schema, or the Supabase client.
    demo_mode: bool = False

    # CORS — origins allowed to call this API during local development.
    cors_allowed_origins: list[str] = [
        "http://localhost:5173",   # Vite dev server default
        "http://localhost:19006",  # Expo web dev default (SDK < 49)
        "http://localhost:8081",   # Expo web dev default (SDK 49+, incl. this project's SDK 54)
    ]

    # Base URL of the deployed provider web app — used only to build the
    # redirect_to link Supabase Auth's password-recovery email points
    # back at (POST /auth/forgot-password). Never used for anything else;
    # this backend never redirects a request here itself.
    web_app_url: str = "http://localhost:5173"

    # Supabase — service-role key bypasses RLS and is used for all backend
    # reads/writes (see core/security.py). The anon key is used only for
    # the /auth/sign-in and /auth/refresh endpoints, which authenticate a
    # user's password/token against Supabase Auth without ever using the
    # service-role key for that purpose.
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # OpenAI — server-side only. Never expose these to the mobile or web
    # clients. Model is intentionally configurable and never hardcoded
    # elsewhere in the codebase; verify it's actually available on the
    # connected account before Phase 3 (live integration) proceeds.
    openai_api_key: str = ""
    openai_model: str = "gpt-5.6-terra"

    # AI workflow controls (Phase 3/4). Safe-by-default: AI is off until
    # explicitly enabled, and safety review is on by default so it can't
    # be silently skipped by omission.
    ai_enabled: bool = False
    ai_timeout_seconds: float = 20.0
    ai_max_retries: int = 2
    ai_require_safety_review: bool = True

    # Synthetic seed-account credentials (backend/scripts/seed_synthetic_
    # users.py). Deliberately NOT given default values, including for the
    # emails: the seeding script refuses to run with any of these unset,
    # rather than silently using a built-in fictional identity. Passwords
    # are read here and never printed, logged, or returned by any route.
    seed_provider_email: str = ""
    seed_provider_password: str = ""
    seed_patient_email: str = ""
    seed_patient_password: str = ""

    # A second synthetic provider (backend/scripts/seed_second_provider.py)
    # — exists only so the reassignment feature has someone real to
    # reassign a patient TO. Same "refuses to run unset" rule as above.
    seed_provider2_email: str = ""
    seed_provider2_password: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance so .env isn't re-read on every request."""
    return Settings()
