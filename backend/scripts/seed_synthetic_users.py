"""
One-time script to seed synthetic demo accounts for local testing.

Creates ONE synthetic provider and ONE synthetic patient (fictional name,
fully synthetic data — see docs/00-scope-freeze.md and the master brief
on demonstration data), assigns the patient to the provider, and prints
login credentials so you can grab a real access token for testing the API.

Run once from backend/, with the venv active:
    python scripts/seed_synthetic_users.py

Safe to re-run — skips creating anything that already exists.
"""

import sys
from pathlib import Path

# Add backend/ to the path so `from app...` imports work when this script
# is run directly rather than through pytest.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.security import get_supabase_client  # noqa: E402

PATIENT_EMAIL = "nimal.perera.demo@carepulse.test"
PATIENT_PASSWORD = "DemoPatient123!"
PROVIDER_EMAIL = "dr.silva.demo@carepulse.test"
PROVIDER_PASSWORD = "DemoProvider123!"


def get_or_create_auth_user(supabase, email: str, password: str):
    try:
        created = supabase.auth.admin.create_user(
            {"email": email, "password": password, "email_confirm": True}
        )
        print(f"  Created auth user: {email}")
        return created.user
    except Exception as e:
        if "already" in str(e).lower() or "registered" in str(e).lower():
            users = supabase.auth.admin.list_users()
            for u in users:
                if u.email == email:
                    print(f"  Auth user already exists: {email}")
                    return u
            raise RuntimeError(f"{email} reported as existing but not found in list_users()")
        raise


def main():
    supabase = get_supabase_client()

    print("Seeding provider...")
    provider_auth_user = get_or_create_auth_user(supabase, PROVIDER_EMAIL, PROVIDER_PASSWORD)

    if (
        supabase.table("users").select("id").eq("id", provider_auth_user.id).maybe_single().execute().data
        is None
    ):
        supabase.table("users").insert(
            {"id": provider_auth_user.id, "email": PROVIDER_EMAIL, "role": "provider"}
        ).execute()
        print("  Inserted users row (role=provider)")

    existing_provider_profile = (
        supabase.table("provider_profiles")
        .select("id")
        .eq("user_id", provider_auth_user.id)
        .maybe_single()
        .execute()
    )
    if existing_provider_profile.data is None:
        profile = (
            supabase.table("provider_profiles")
            .insert(
                {
                    "user_id": provider_auth_user.id,
                    "full_name": "Dr. Kumari Silva",
                    "role_label": "Doctor",
                }
            )
            .execute()
        )
        provider_profile_id = profile.data[0]["id"]
        print("  Inserted provider_profiles row")
    else:
        provider_profile_id = existing_provider_profile.data["id"]

    print("\nSeeding patient...")
    patient_auth_user = get_or_create_auth_user(supabase, PATIENT_EMAIL, PATIENT_PASSWORD)

    if (
        supabase.table("users").select("id").eq("id", patient_auth_user.id).maybe_single().execute().data
        is None
    ):
        supabase.table("users").insert(
            {"id": patient_auth_user.id, "email": PATIENT_EMAIL, "role": "patient"}
        ).execute()
        print("  Inserted users row (role=patient)")

    existing_patient_profile = (
        supabase.table("patient_profiles")
        .select("id")
        .eq("user_id", patient_auth_user.id)
        .maybe_single()
        .execute()
    )
    if existing_patient_profile.data is None:
        profile = (
            supabase.table("patient_profiles")
            .insert(
                {
                    "user_id": patient_auth_user.id,
                    "full_name": "Nimal Perera",
                    "age": 58,
                    "contact_number": "0770000000",
                }
            )
            .execute()
        )
        patient_profile_id = profile.data[0]["id"]
        print("  Inserted patient_profiles row")
    else:
        patient_profile_id = existing_patient_profile.data["id"]

    print("\nAssigning patient to provider...")
    existing_assignment = (
        supabase.table("patient_provider_assignments")
        .select("id")
        .eq("patient_id", patient_profile_id)
        .eq("provider_id", provider_profile_id)
        .maybe_single()
        .execute()
    )
    if existing_assignment.data is None:
        supabase.table("patient_provider_assignments").insert(
            {"patient_id": patient_profile_id, "provider_id": provider_profile_id, "is_active": True}
        ).execute()
        print("  Created active assignment")
    else:
        print("  Assignment already exists")

    print("\nDone. Demo login credentials (synthetic, fictional data only):")
    print(f"  Patient  - email: {PATIENT_EMAIL}  password: {PATIENT_PASSWORD}")
    print(f"  Provider - email: {PROVIDER_EMAIL}  password: {PROVIDER_PASSWORD}")


if __name__ == "__main__":
    main()
