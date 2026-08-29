"""
Idempotent script to seed a few weeks of sample blood-pressure readings
and weekly check-ins (with real rule-engine-derived risk assessments)
for the synthetic patient created by seed_synthetic_users.py.

Exists purely to make the mobile app's History screen (and the provider
dashboard) show something other than empty states during manual testing
— seed_synthetic_users.py deliberately only creates the login accounts,
never any BP/check-in data (see its docstring), so a freshly-seeded
patient has nothing to show until either the app is used by hand or this
script is run.

Uses the exact same insert shapes and rule-engine call as the real
POST /patient/check-ins route (app/api/checkins.py) so the seeded rows
look exactly like ones a real submission would have produced — same
columns, same risk_assessments row per check-in, same reason codes.

Run once from backend/, with the venv active:
    python scripts/seed_sample_history.py

Safe to re-run: it looks up the patient by SEED_PATIENT_EMAIL and checks
for a "seed-history-*" idempotency_key prefix before inserting, so
re-running never duplicates the check-ins it created (BP readings that
aren't linked to one of those check-ins are still re-inserted each run,
since they don't carry an idempotency key of their own — delete the
existing seeded rows first via the Supabase dashboard if you want a
clean re-seed of those).
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend/ to the path so `from app...` imports work when this script
# is run directly rather than through pytest.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.core.db import one_or_none  # noqa: E402
from app.core.security import get_supabase_client  # noqa: E402
from app.services.ai.summary import generate_fallback_summary  # noqa: E402
from app.services.rules.engine import RuleInput, evaluate  # noqa: E402

IDEMPOTENCY_PREFIX = "seed-history-"

# (days_ago, systolic, diastolic, pulse, notes) — a mix of normal and
# slightly elevated readings, newest last so History's "Recent entries"
# reads top-to-bottom the way a real week would.
BP_READINGS = [
    (13, 118, 76, 72, None),
    (10, 122, 79, 75, None),
    (7, 131, 84, 80, "Felt fine, measured after breakfast"),
    (4, 128, 82, 77, None),
    (1, 135, 88, 83, "Slightly stressed day"),
]

# (days_ago, missed_doses, missed_dose_count, medication_stopped,
#  supply_remaining, difficulty_reported, difficulty_text,
#  side_effects_reported, side_effects_text)
CHECK_INS = [
    (
        12,
        False,
        0,
        False,
        True,
        False,
        None,
        False,
        None,
    ),
    (
        5,
        True,
        2,
        False,
        True,
        True,
        "Ran out of time in the mornings",
        False,
        None,
    ),
]


def _require_seed_config():
    settings = get_settings()
    if not settings.seed_patient_email:
        print("Missing SEED_PATIENT_EMAIL in backend/.env.")
        print("Run scripts/seed_synthetic_users.py first, then re-run this script.")
        sys.exit(1)
    return settings


def _get_patient_profile_id(supabase, email: str) -> str:
    user_row = one_or_none(supabase.table("users").select("id").eq("email", email))
    if user_row is None:
        print(f"No users row found for {email}. Run scripts/seed_synthetic_users.py first.")
        sys.exit(1)

    profile_row = one_or_none(
        supabase.table("patient_profiles").select("id").eq("user_id", user_row["id"])
    )
    if profile_row is None:
        print(f"No patient_profiles row found for {email}. Run scripts/seed_synthetic_users.py first.")
        sys.exit(1)
    return profile_row["id"]


def _seed_bp_readings(supabase, patient_id: str) -> None:
    print("\nSeeding blood pressure readings...")
    now = datetime.now(timezone.utc)
    for days_ago, systolic, diastolic, pulse, notes in BP_READINGS:
        measured_at = now - timedelta(days=days_ago)
        supabase.table("blood_pressure_readings").insert(
            {
                "patient_id": patient_id,
                "systolic": systolic,
                "diastolic": diastolic,
                "pulse": pulse,
                "notes": notes,
                "measured_at": measured_at.isoformat(),
                "recorded_at": measured_at.isoformat(),
            }
        ).execute()
        print(f"  Inserted {systolic}/{diastolic} mmHg ({days_ago} day(s) ago)")


def _seed_check_ins(supabase, patient_id: str) -> None:
    print("\nSeeding weekly check-ins...")
    now = datetime.now(timezone.utc)
    for i, (
        days_ago,
        missed_doses,
        missed_dose_count,
        medication_stopped,
        supply_remaining,
        difficulty_reported,
        difficulty_text,
        side_effects_reported,
        side_effects_text,
    ) in enumerate(CHECK_INS, start=1):
        idempotency_key = f"{IDEMPOTENCY_PREFIX}{i}"
        existing = one_or_none(
            supabase.table("weekly_check_ins")
            .select("id")
            .eq("idempotency_key", idempotency_key)
        )
        if existing is not None:
            print(f"  Check-in {i} already seeded (id={existing['id']}), skipping.")
            continue

        submitted_at = now - timedelta(days=days_ago)

        rule_result = evaluate(
            RuleInput(
                medication_stopped=medication_stopped,
                missed_dose_count=missed_dose_count,
                supply_remaining=supply_remaining,
                difficulty_reported=difficulty_reported,
                side_effects_reported=side_effects_reported,
                systolic=None,
                diastolic=None,
            )
        )

        check_in_insert = (
            supabase.table("weekly_check_ins")
            .insert(
                {
                    "patient_id": patient_id,
                    "idempotency_key": idempotency_key,
                    "missed_doses": missed_doses,
                    "missed_dose_count": missed_dose_count,
                    "medication_stopped": medication_stopped,
                    "supply_remaining": supply_remaining,
                    "difficulty_reported": difficulty_reported,
                    "difficulty_text": difficulty_text,
                    "side_effects_reported": side_effects_reported,
                    "side_effects_text": side_effects_text,
                    "requests_contact": False,
                    "patient_submitted_at": submitted_at.isoformat(),
                    "server_received_at": submitted_at.isoformat(),
                }
            )
            .execute()
        )
        check_in_id = check_in_insert.data[0]["id"]

        provider_summary = generate_fallback_summary(
            medication_stopped=medication_stopped,
            missed_dose_count=missed_dose_count,
            supply_bucket_label="some remaining" if supply_remaining else "none remaining",
            systolic=None,
            diastolic=None,
            difficulty_reported=difficulty_reported,
            difficulty_text=difficulty_text,
        )

        assessment_insert = (
            supabase.table("risk_assessments")
            .insert(
                {
                    "check_in_id": check_in_id,
                    "rule_result_level": rule_result.risk_level,
                    "rule_version": rule_result.rule_version,
                    "final_level": rule_result.risk_level,
                    "provider_summary": provider_summary,
                    "ai_status": "pending",
                }
            )
            .execute()
        )
        assessment_id = assessment_insert.data[0]["id"]

        for code in rule_result.reason_codes:
            supabase.table("risk_reasons").insert(
                {"risk_assessment_id": assessment_id, "reason_code": code, "source": "rule"}
            ).execute()

        if rule_result.risk_level in ("medium", "high"):
            supabase.table("alerts").insert(
                {
                    "risk_assessment_id": assessment_id,
                    "patient_id": patient_id,
                    "status": "open",
                }
            ).execute()

        print(
            f"  Inserted check-in {i} (id={check_in_id}, risk={rule_result.risk_level}, "
            f"{days_ago} day(s) ago)"
        )


def main():
    settings = _require_seed_config()
    supabase = get_supabase_client()

    print(f"Looking up patient profile for {settings.seed_patient_email}...")
    patient_id = _get_patient_profile_id(supabase, settings.seed_patient_email)
    print(f"  patient_profiles id: {patient_id}")

    _seed_bp_readings(supabase, patient_id)
    _seed_check_ins(supabase, patient_id)

    print("\nDone. Reload History in the mobile app to see the seeded data.")


if __name__ == "__main__":
    main()
