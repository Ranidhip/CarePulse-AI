"""Seed explicit synthetic workflow evidence without calling OpenAI."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.security import get_supabase_client  # noqa: E402
from app.services.demo_workflow import (  # noqa: E402
    DemoSafetyError,
    load_demo_context,
    seed_demo_workflow,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm-synthetic-seed",
        action="store_true",
        help="Required acknowledgement that synthetic Supabase rows will be created.",
    )
    args = parser.parse_args()
    if not args.confirm_synthetic_seed:
        print("Refusing to write without --confirm-synthetic-seed")
        return 2

    settings = get_settings()
    if not settings.seed_provider_email or not settings.seed_patient_email:
        print("Missing SEED_PROVIDER_EMAIL or SEED_PATIENT_EMAIL in backend/.env")
        return 2
    try:
        client = get_supabase_client()
        context = load_demo_context(
            client,
            provider_email=settings.seed_provider_email,
            patient_email=settings.seed_patient_email,
        )
        print("Creating/reusing SYNTHETIC demonstration evidence; no OpenAI call will occur.")
        print(f"Provider: {context.provider_name}")
        print(f"Patient: {context.patient_name}")
        result = seed_demo_workflow(client, context)
    except DemoSafetyError as exc:
        print(str(exc))
        return 1
    print(f"Synthetic run ready: {result.run_id}")
    print(f"Actions ready: {result.action_count}; tasks ready: {len(result.task_ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
