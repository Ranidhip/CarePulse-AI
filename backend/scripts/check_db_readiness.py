"""
Read-only check for whether the required Supabase tables exist and are
reachable via the service-role client. Does NOT assume any particular
migration has been applied, and NEVER creates, alters, or drops anything.

Run manually, from backend/, with the venv active:

    python scripts/check_db_readiness.py

Expected output when your original init_schema migration is applied and
backend/.env is filled in: every core table listed as "OK", and a summary
line saying core schema is ready. The agent-workflow tables (from the
Phase 1 migration) are reported separately and are informational only —
Phase 2 does not require them.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.security import get_supabase_client  # noqa: E402

# Exactly the tables Phase 2 (real auth + production patient/provider
# APIs) depends on. All seven are expected to already exist from the
# original init_schema migration, independent of anything in Phase 1.
CORE_TABLES = [
    "users",
    "patient_profiles",
    "provider_profiles",
    "patient_provider_assignments",
    "weekly_check_ins",
    "alerts",
    "risk_assessments",
]

# Added by the Phase 1 migration (supabase/migrations/20260818150000_
# agent_workflow_tables.sql). Not required for Phase 2 to work — reported
# only so you know whether that migration has been applied yet.
AGENT_WORKFLOW_TABLES = [
    "agent_runs",
    "agent_actions",
    "follow_up_tasks",
]


def _table_reachable(supabase, table_name: str) -> tuple[bool, str]:
    try:
        supabase.table(table_name).select("*").limit(1).execute()
        return True, ""
    except Exception as e:
        # Trim to one line — Postgres/PostgREST errors can be long, and
        # this is printed to a local terminal, never returned by an API.
        return False, str(e).splitlines()[0][:200]


def main() -> int:
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_service_role_key:
        print(
            "SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set in "
            "backend/.env. Fill those in first (see backend/.env.example), "
            "then re-run this script."
        )
        return 1

    supabase = get_supabase_client()

    print(f"Checking Supabase project: {settings.supabase_url}\n")

    print("Core schema (required for Phase 2):")
    all_core_ok = True
    for table in CORE_TABLES:
        ok, error = _table_reachable(supabase, table)
        all_core_ok = all_core_ok and ok
        status_label = "OK" if ok else "MISSING or UNREACHABLE"
        print(f"  [{status_label:>22}]  public.{table}")
        if not ok:
            print(f"      -> {error}")

    print("\nAgent-workflow schema (Phase 1 migration — informational only):")
    all_agent_ok = True
    for table in AGENT_WORKFLOW_TABLES:
        ok, error = _table_reachable(supabase, table)
        all_agent_ok = all_agent_ok and ok
        status_label = "OK" if ok else "not applied yet"
        print(f"  [{status_label:>22}]  public.{table}")
        if not ok:
            print(f"      -> {error}")

    print()
    if all_core_ok:
        print("Core schema is ready. Phase 2 routes can be exercised against this project.")
    else:
        print(
            "Core schema is INCOMPLETE. Apply the original init_schema migration "
            "(supabase/migrations/\"20260811043241_init_schema (2).sql\") before "
            "using any Phase 2 route."
        )
    if not all_agent_ok:
        print(
            "Note: the Phase 1 agent-workflow migration has not been fully applied. "
            "This does not block Phase 2 — it will matter starting Phase 4."
        )

    return 0 if all_core_ok else 1


if __name__ == "__main__":
    sys.exit(main())
