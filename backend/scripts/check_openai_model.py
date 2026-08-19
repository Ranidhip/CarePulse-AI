"""
Read-only check for whether OPENAI_MODEL is actually available on the
connected OpenAI account. Does not enable AI, does not modify anything.

Run manually, from backend/, with the venv active, before setting
AI_ENABLED=true for the first time (or after changing OPENAI_MODEL):

    python scripts/check_openai_model.py

Expected output when everything is configured correctly: a confirmation
that the model is available, and it's then safe to set AI_ENABLED=true.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.services.ai.client import get_openai_client, verify_model_available  # noqa: E402


def main() -> int:
    settings = get_settings()

    if not settings.openai_api_key:
        print(
            "OPENAI_API_KEY is not set in backend/.env. Fill that in first "
            "(see backend/.env.example), then re-run this script."
        )
        return 1

    if not settings.openai_model:
        print("OPENAI_MODEL is not set in backend/.env.")
        return 1

    print(f"Checking OpenAI model availability: {settings.openai_model}")
    client = get_openai_client()
    ok, message = verify_model_available(client, settings.openai_model)

    if ok:
        print(f"OK — '{settings.openai_model}' is available on this account.")
        print("Safe to set AI_ENABLED=true in backend/.env.")
        return 0
    else:
        print(f"NOT READY — {message}")
        print("Do not set AI_ENABLED=true until this is resolved.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
