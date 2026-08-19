"""
Prints a fresh access token for the seeded synthetic patient or provider
account, so you can test the real API endpoints via curl, Postman, or
FastAPI's /docs page.

Usage (from backend/, venv active):
    python scripts/get_access_token.py patient
    python scripts/get_access_token.py provider

This is a local, manual-testing-only tool: the token it prints is your
own real Supabase session token for a fictional test account, not a
secret to be committed, shared, or logged anywhere persistent. Never pipe
this script's output into a file that gets committed or uploaded.

Credentials come from backend/.env (kept in sync with
scripts/seed_synthetic_users.py, which must be run first) — never
hardcoded here.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.security import get_anon_supabase_client  # noqa: E402


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("patient", "provider"):
        print("Usage: python scripts/get_access_token.py [patient|provider]")
        sys.exit(1)

    settings = get_settings()

    if sys.argv[1] == "patient":
        email, password = settings.seed_patient_email, settings.seed_patient_password
    else:
        email, password = settings.seed_provider_email, settings.seed_provider_password

    if not email or not password:
        print(
            f"SEED_{sys.argv[1].upper()}_EMAIL / SEED_{sys.argv[1].upper()}_PASSWORD are not "
            "set in backend/.env. Run scripts/seed_synthetic_users.py's setup first."
        )
        sys.exit(1)

    # Signs in exactly the way a real client would: via the anon client,
    # the same one app/api/auth.py's POST /auth/sign-in uses. This is the
    # one script where printing a token to your own local terminal is the
    # intended behavior — it's what lets you paste it into Postman/curl.
    anon_client = get_anon_supabase_client()
    result = anon_client.auth.sign_in_with_password({"email": email, "password": password})

    print(f"\nAccess token for {email}:\n")
    print(result.session.access_token)
    print("\nUse it as header: Authorization: Bearer <token above>\n")


if __name__ == "__main__":
    main()
