"""
Reusable, idempotent script to add ADDITIONAL synthetic patients beyond
the one seed_synthetic_users.py creates — useful for testing the provider
dashboard with more than one patient in the queue. Fictional data only
(see docs/00-scope-freeze.md and the master brief on demonstration data).

Reuses the exact same account-creation logic as seed_synthetic_users.py
(get_or_create_auth_user, _ensure_users_row) so a re-run behaves
identically: safe to run any number of times, reuses existing rows
instead of duplicating them, never prints a password or the service-role
key.

The new patient is assigned to the provider identified by --provider-email
(defaults to SEED_PROVIDER_EMAIL in backend/.env) — that provider must
already exist, i.e. you must have run seed_synthetic_users.py at least
once first.

Usage, from backend/ with the venv active:
    python scripts/add_synthetic_patient.py \\
        --name "Priya Fernando (Synthetic Test Account)" \\
        --email priya.synthetic@carepulse.test \\
        --password "SomeFictionalPass456!" \\
        --age 47 \\
        --contact 0771234567
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.db import one_or_none  # noqa: E402
from app.core.security import get_supabase_client  # noqa: E402
from scripts.seed_synthetic_users import (  # noqa: E402
    _ensure_users_row,
    get_or_create_auth_user,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Patient full name")
    parser.add_argument("--email", required=True, help="Patient sign-in email")
    parser.add_argument("--password", required=True, help="Patient sign-in password")
    parser.add_argument("--age", type=int, default=None, help="Patient age (optional)")
    parser.add_argument("--contact", default=None, help="Patient contact number (optional)")
    parser.add_argument(
        "--provider-email",
        default=None,
        help="Provider to assign this patient to (defaults to SEED_PROVIDER_EMAIL in .env)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = get_settings()
    provider_email = args.provider_email or settings.seed_provider_email
    if not provider_email:
        print(
            "No provider email given and SEED_PROVIDER_EMAIL is not set in backend/.env. "
            "Pass --provider-email, or run scripts/seed_synthetic_users.py first."
        )
        sys.exit(1)

    supabase = get_supabase_client()

    # Look up the existing provider by email rather than creating one —
    # this script only ever adds patients, never providers.
    provider_users_row = one_or_none(
        supabase.table("users").select("id").eq("email", provider_email).eq("role", "provider")
    )
    if provider_users_row is None:
        print(
            f"No provider account found for {provider_email}. Run "
            "scripts/seed_synthetic_users.py first (or check SEED_PROVIDER_EMAIL in .env)."
        )
        sys.exit(1)
    provider_profile = one_or_none(
        supabase.table("provider_profiles").select("id").eq("user_id", provider_users_row["id"])
    )
    if provider_profile is None:
        print(f"Provider {provider_email} has no provider_profiles row. Run seed_synthetic_users.py first.")
        sys.exit(1)
    provider_profile_id = provider_profile["id"]

    print(f"Adding patient {args.name} <{args.email}>...")
    patient_auth_user = get_or_create_auth_user(supabase, args.email, args.password)
    _ensure_users_row(supabase, patient_auth_user.id, args.email, "patient")

    existing_patient_profile = one_or_none(
        supabase.table("patient_profiles").select("id").eq("user_id", patient_auth_user.id)
    )
    if existing_patient_profile is None:
        profile = (
            supabase.table("patient_profiles")
            .insert(
                {
                    "user_id": patient_auth_user.id,
                    "full_name": args.name,
                    "age": args.age,
                    "contact_number": args.contact,
                }
            )
            .execute()
        )
        patient_profile_id = profile.data[0]["id"]
        print(f"  Inserted patient_profiles row (id={patient_profile_id})")
    else:
        patient_profile_id = existing_patient_profile["id"]
        print(f"  patient_profiles row already exists (id={patient_profile_id})")

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
        print(f"  Created active assignment to {provider_email} (id={assignment.data[0]['id']})")
    else:
        print(f"  Active assignment to {provider_email} already exists (id={existing_assignment['id']})")

    print("\nDone. This patient can now sign in on the mobile app with the")
    print("email/password you passed in, and will appear on that provider's dashboard.")


if __name__ == "__main__":
    main()
