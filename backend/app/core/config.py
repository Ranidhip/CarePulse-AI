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

    # CORS — origins allowed to call this API during local development.
    cors_allowed_origins: list[str] = [
        "http://localhost:5173",   # Vite dev server default
        "http://localhost:19006",  # Expo web dev default
    ]

    # Supabase — filled in during the Day 4/Day 9 auth + database setup.
    # Leave blank for now; the app must still start without these set.
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # OpenAI — filled in during AI-service setup (Week 2).
    # Server-side only. Never expose this to the mobile or web clients.
    openai_api_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance so .env isn't re-read on every request."""
    return Settings()
