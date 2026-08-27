"""
Idempotent script to seed ONE additional synthetic provider (fictional
data only — see docs/00-scope-freeze.md), so the reassignment feature has
someone real to reassign a patient TO. Mirrors seed_synthetic_users.py's
pattern exactly, minus the patient/assignment part.

Credentials come from backend/.env (SEED_PROVIDER2_EMAIL,
SEED_PROVIDER2_PASSWORD) — refuses to run if either is unset, and never
prints a password or access token.

Run once from backend/, with the venv active:
    python scripts/seed_second_provider.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.db import one_or_none  # noqa: E402
from app.core.security import get_supabase_client  # noqa: E402
from scripts.seed_synthetic_users import _ensure_users_row, get_or_create_auth_user  # noqa: E402

PROVIDER2_FULL_NAME = "Dr. Ahmed Rizvi (Synthetic Test Account)"
PROVIDER2_ROLE_LABEL = "Doctor"


def main():
    settings = get_settings()
    if not settings.seed_provider2_email or not settings.seed_provider2_password:
        print("Missing SEED_PROVIDER2_EMAIL / SEED_PROVIDER2_PASSWORD in backend/.env.")
        print("See backend/.env.example for the expected format, then re-run this script.")
        sys.exit(1)

    supabase = get_supabase_client()

    print("Seeding second provider...")
    provider_auth_user = get_or_create_auth_user(
        supabase, settings.seed_provider2_email, settings.seed_provider2_password
    )
    _ensure_users_row(supabase, provider_auth_user.id, settings.seed_provider2_email, "provider")

    existing_profile = one_or_none(
        supabase.table("provider_profiles").select("id").eq("user_id", provider_auth_user.id)
    )
    if existing_profile is None:
        profile = (
            supabase.table("provider_profiles")
            .insert(
                {
                    "user_id": provider_auth_user.id,
                    "full_name": PROVIDER2_FULL_NAME,
                    "role_label": PROVIDER2_ROLE_LABEL,
                }
            )
            .execute()
        )
        print(f"  Inserted provider_profiles row (id={profile.data[0]['id']})")
    else:
        print(f"  provider_profiles row already exists (id={existing_profile['id']})")

    print("\nSeeding complete. This provider starts with zero assigned patients —")
    print("that's expected; it exists to be a reassignment target.")


if __name__ == "__main__":
    main()
