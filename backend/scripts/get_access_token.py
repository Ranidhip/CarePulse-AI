"""
Prints a fresh access token for one of the seeded demo accounts, so you
can test the real API endpoints via curl, Postman, or FastAPI's /docs page.

Usage (from backend/, venv active):
    python scripts/get_access_token.py patient
    python scripts/get_access_token.py provider
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from supabase import create_client  # noqa: E402

# Kept in sync with scripts/seed_synthetic_users.py
PATIENT_EMAIL = "nimal.perera.demo@carepulse.test"
PATIENT_PASSWORD = "DemoPatient123!"
PROVIDER_EMAIL = "dr.silva.demo@carepulse.test"
PROVIDER_PASSWORD = "DemoProvider123!"


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("patient", "provider"):
        print("Usage: python scripts/get_access_token.py [patient|provider]")
        sys.exit(1)

    settings = get_settings()
    # Dev-only convenience: this script signs in using a client built with
    # the secret key. Real apps must always sign in using the publishable
    # key instead — this script never ships, it's just a local testing tool.
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    if sys.argv[1] == "patient":
        email, password = PATIENT_EMAIL, PATIENT_PASSWORD
    else:
        email, password = PROVIDER_EMAIL, PROVIDER_PASSWORD

    result = supabase.auth.sign_in_with_password({"email": email, "password": password})
    print(f"\nAccess token for {email}:\n")
    print(result.session.access_token)
    print("\nUse it as header: Authorization: Bearer <token above>\n")


if __name__ == "__main__":
    main()
