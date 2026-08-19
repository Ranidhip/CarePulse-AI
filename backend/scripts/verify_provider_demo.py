"""Run the real synthetic-provider Phase 7 API verification."""

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.services.demo_verification import (  # noqa: E402
    VerificationError,
    verify_provider_demo,
)


def main() -> int:
    settings = get_settings()
    if not settings.seed_provider_email or not settings.seed_provider_password:
        print("Missing SEED_PROVIDER_EMAIL or SEED_PROVIDER_PASSWORD in backend/.env")
        return 2
    base_url = os.getenv("CAREPULSE_API_URL", "http://127.0.0.1:8000").rstrip("/")

    def request(method: str, path: str, body: dict | None, token: str | None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        payload = json.dumps(body).encode() if body is not None else None
        try:
            with urlopen(
                Request(base_url + path, data=payload, headers=headers, method=method), timeout=15
            ) as response:
                return response.status, json.loads(response.read() or b"null")
        except HTTPError as exc:
            try:
                response_body = json.loads(exc.read() or b"null")
            except json.JSONDecodeError:
                response_body = None
            return exc.code, response_body

    try:
        result = verify_provider_demo(
            request,
            provider_email=settings.seed_provider_email,
            provider_password=settings.seed_provider_password,
        )
    except (VerificationError, OSError) as exc:
        print(f"FAIL: {exc}")
        return 1
    for check in result.checks:
        print(f"PASS: {check}")
    print(f"Synthetic task {result.transitioned_task_id} is now {result.resulting_status}.")
    print("No password, refresh token, service-role key, or access token was printed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
