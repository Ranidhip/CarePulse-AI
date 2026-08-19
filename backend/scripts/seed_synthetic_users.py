"""
Idempotent script to seed ONE synthetic provider and ONE synthetic
patient for testing the real Supabase Auth flow (fictional data only —
see docs/00-scope-freeze.md and the master brief on demonstration data).

Uses the Supabase Auth ADMIN API exclusively to create/find the auth
users (never raw SQL against auth.users), then creates or reuses the
matching public.users, provider_profiles, and patient_profiles rows, and
the active patient_provider_assignments row between them.

Credentials come from backend/.env (SEED_PROVIDER_EMAIL,
SEED_PROVIDER_PASSWORD, SEED_PATIENT_EMAIL, SEED_PATIENT_PASSWORD) — this
script refuses to run if any of the four are unset, and never prints a
password, access token, or the service-role key. Output is limited to
non-sensitive database IDs and completion status.

Run once from backend/, with the venv active:
    python scripts/seed_synthetic_users.py

Safe to re-run any number of times — every "does this already exist"
check uses app.core.db.one_or_none(), which is .limit(1)-based, never
.maybe_single(). That distinction is the fix for a real bug: postgrest-py
0.16.11's .maybe_single().execute() returns a bare None (not a response
object) on zero matching rows, so any code that then accessed .data on it
crashed with AttributeError — which is exactly what happened here on a
real Supabase project, immediately after successfully creating the
provider Auth account. one_or_none() sidesteps this entirely: .limit(1)
always returns a normal response object with .data as a list, empty or
one item, so there is no special "zero rows behaves differently" case to
get wrong. See app/core/db.py for the full explanation.

Because the provider Auth account from that earlier failed run already
exists in Supabase, this corrected script's first step
(get_or_create_auth_user) will detect it via list_users() and reuse it
rather than creating a duplicate — nothing needs to be cleaned up by
hand before re-running.
"""

import sys
from pathlib import Path

# Add backend/ to the path so `from app...` imports work when this script
# is run directly rather than through pytest.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.db import one_or_none  # noqa: E402
from app.core.security import get_supabase_client  # noqa: E402

PROVIDER_FULL_NAME = "Dr. Kumari Silva (Synthetic Test Account)"
PROVIDER_ROLE_LABEL = "Doctor"
PATIENT_FULL_NAME = "Nimal Perera (Synthetic Test Account)"
PATIENT_AGE = 58
PATIENT_CONTACT_NUMBER = "0770000000"


def _require_seed_config():
    settings = get_settings()
    missing = [
        name
        for name, value in (
            ("SEED_PROVIDER_EMAIL", settings.seed_provider_email),
            ("SEED_PROVIDER_PASSWORD", settings.seed_provider_password),
            ("SEED_PATIENT_EMAIL", settings.seed_patient_email),
            ("SEED_PATIENT_PASSWORD", settings.seed_patient_password),
        )
        if not value
    ]
    if missing:
        print("Missing required settings in backend/.env: " + ", ".join(missing))
        print("See backend/.env.example for the expected format, then re-run this script.")
        sys.exit(1)
    return settings


def get_or_create_auth_user(supabase, email: str, password: str):
    """
    Returns the Supabase Auth user for `email`, creating it via the Admin
    API if it doesn't already exist. Never logs the password. If a
    previous run already created this account (as happened here), the
    "already registered" branch below finds and reuses it instead of
    erroring or duplicating it.
    """
    try:
        created = supabase.auth.admin.create_user(
            {"email": email, "password": password, "email_confirm": True}
        )
        print(f"  Created auth user (id={created.user.id})")
        return created.user
    except Exception as e:
        if "already" in str(e).lower() or "registered" in str(e).lower():
            users = supabase.auth.admin.list_users()
            for u in users:
                if u.email == email:
                    print(f"  Reusing existing auth user (id={u.id})")
                    return u
            raise RuntimeError(
                "An account for this email was reported as existing but was not "
                "found via list_users(). Check the Supabase dashboard directly."
            )
        raise


def _ensure_users_row(supabase, auth_user_id: str, email: str, role: str) -> None:
    row = one_or_none(supabase.table("users").select("id").eq("id", auth_user_id))
    if row is None:
        supabase.table("users").insert(
            {"id": auth_user_id, "email": email, "role": role}
        ).execute()
        print(f"  Inserted users row (role={role})")
    else:
        print(f"  users row already exists (role={role})")


def main():
    settings = _require_seed_config()
    supabase = get_supabase_client()

    print("Seeding provider...")
    provider_auth_user = get_or_create_auth_user(
        supabase, settings.seed_provider_email, settings.seed_provider_password
    )
    _ensure_users_row(supabase, provider_auth_user.id, settings.seed_provider_email, "provider")

    existing_provider_profile = one_or_none(
        supabase.table("provider_profiles").select("id").eq("user_id", provider_auth_user.id)
    )
    if existing_provider_profile is None:
        profile = (
            supabase.table("provider_profiles")
            .insert(
                {
                    "user_id": provider_auth_user.id,
                    "full_name": PROVIDER_FULL_NAME,
                    "role_label": PROVIDER_ROLE_LABEL,
                }
            )
            .execute()
        )
        provider_profile_id = profile.data[0]["id"]
        print(f"  Inserted provider_profiles row (id={provider_profile_id})")
    else:
        provider_profile_id = existing_provider_profile["id"]
        print(f"  provider_profiles row already exists (id={provider_profile_id})")

    print("\nSeeding patient...")
    patient_auth_user = get_or_create_auth_user(
        supabase, settings.seed_patient_email, settings.seed_patient_password
    )
    _ensure_users_row(supabase, patient_auth_user.id, settings.seed_patient_email, "patient")

    existing_patient_profile = one_or_none(
        supabase.table("patient_profiles").select("id").eq("user_id", patient_auth_user.id)
    )
    if existing_patient_profile is None:
        profile = (
            supabase.table("patient_profiles")
            .insert(
                {
                    "user_id": patient_auth_user.id,
                    "full_name": PATIENT_FULL_NAME,
                    "age": PATIENT_AGE,
                    "contact_number": PATIENT_CONTACT_NUMBER,
                }
            )
            .execute()
        )
        patient_profile_id = profile.data[0]["id"]
        print(f"  Inserted patient_profiles row (id={patient_profile_id})")
    else:
        patient_profile_id = existing_patient_profile["id"]
        print(f"  patient_profiles row already exists (id={patient_profile_id})")

    print("\nAssigning patient to provider...")
    existing_assignment = one_or_none(
        supabase.table("patient_provider_assignments")
        .select("id")
        .eq("patient_id", patient_profile_id)
        .eq("provider_id", provider_profile_id)
        .eq("is_active", True)
    )
    if existing_assignment is None:
        assignment = (
            supabase.table("patient_provider_assignments")
            .insert(
                {
                    "patient_id": patient_profile_id,
                    "provider_id": provider_profile_id,
                    "is_active": True,
                }
            )
            .execute()
        )
        print(f"  Created active assignment (id={assignment.data[0]['id']})")
    else:
        print(f"  Active assignment already exists (id={existing_assignment['id']})")

    print("\nSeeding complete.")
    print("Credentials were read from backend/.env — this script never displays them.")
    print(f"  Provider auth user id: {provider_auth_user.id}")
    print(f"  Patient auth user id:  {patient_auth_user.id}")
    print(
        "\nTo sign in and get a real access token for manual testing, run:\n"
        "    python scripts/get_access_token.py patient\n"
        "    python scripts/get_access_token.py provider"
    )


if __name__ == "__main__":
    main()
