"""Preview or reset only Phase 7 synthetic workflow evidence."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.security import get_supabase_client  # noqa: E402
from app.services.demo_workflow import (  # noqa: E402
    DemoSafetyError,
    load_demo_context,
    reset_demo_workflow,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm-synthetic-reset",
        action="store_true",
        help="Delete the previewed synthetic-only records. Without it, this is a dry run.",
    )
    args = parser.parse_args()
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
        result = reset_demo_workflow(client, context, confirm=args.confirm_synthetic_reset)
    except DemoSafetyError as exc:
        print(str(exc))
        return 1
    print("SYNTHETIC reset target:")
    print(f"  agent_runs: {len(result.run_ids)}")
    for record_id in result.run_ids:
        print(f"    - {record_id}")
    print(f"  agent_actions: {len(result.action_ids)}")
    for record_id in result.action_ids:
        print(f"    - {record_id}")
    print(f"  follow_up_tasks: {len(result.task_ids)}")
    for record_id in result.task_ids:
        print(f"    - {record_id}")
    if result.deleted:
        print(
            "Deleted synthetic demo evidence. This is not directly recoverable; "
            "re-run the seed script."
        )
    else:
        print("Dry run only. Re-run with --confirm-synthetic-reset to delete these records.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
