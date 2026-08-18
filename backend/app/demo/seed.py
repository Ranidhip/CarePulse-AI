"""
Seeds the demo SQLite database: one demo provider, and six fictional
patients spanning the risk spectrum (per the original scope-freeze
requirement — low, several missed doses, stopped medication, supply
depleted, elevated BP, and one adherent low-risk patient). One patient
(Nimal Perera) has no pre-seeded check-in, so he's also the one used for
live mobile-app testing — real check-ins submitted from Expo simply add
to his history alongside anything seeded here.

Every seeded check-in's risk is computed with the same real rule engine
used everywhere else (app.services.rules.engine.evaluate) — there is no
hardcoded risk_level anywhere, including in seed data.
"""

import uuid
from datetime import datetime, timedelta, timezone

from app.demo.db import get_connection
from app.services.ai.summary import generate_fallback_summary
from app.services.rules.engine import RuleInput, evaluate

DEMO_PATIENT_ID = "demo-patient-nimal"
DEMO_PROVIDER_ID = "demo-provider-silva"

SUPPLY_LABELS = {
    "7+": "7 days or more",
    "3-6": "3-6 days",
    "0-2": "0-2 days",
    "none": "No medicine remaining",
}


def _days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def _insert_patient(conn, patient_id: str, name: str, email: str, age: int) -> None:
    conn.execute(
        "INSERT INTO demo_patients (id, name, email, age) VALUES (?, ?, ?, ?)",
        (patient_id, name, email, age),
    )


def _insert_medications(conn, patient_id: str, meds: list[tuple[str, str, str, int]]) -> None:
    for name, instructions, time, reminder in meds:
        conn.execute(
            """INSERT INTO demo_medications
               (id, patient_id, name, instructions, scheduled_time, reminder_on)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), patient_id, name, instructions, time, reminder),
        )


def _insert_bp(conn, patient_id: str, systolic: int, diastolic: int, days_ago: int) -> None:
    conn.execute(
        """INSERT INTO demo_bp_readings
           (id, patient_id, systolic, diastolic, pulse, measured_at, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            patient_id,
            systolic,
            diastolic,
            None,
            _days_ago(days_ago),
            None,
            _days_ago(days_ago),
        ),
    )


def _insert_checkin(
    conn,
    patient_id: str,
    *,
    medication_stopped: bool,
    missed_dose_count: int | None,
    supply_bucket: str,
    difficulty_reported: bool,
    difficulty_text: str | None,
    systolic: int | None,
    diastolic: int | None,
    days_ago: int,
) -> None:
    supply_remaining = supply_bucket not in ("0-2", "none")
    missed_doses = bool(missed_dose_count and missed_dose_count > 0)

    rule_result = evaluate(
        RuleInput(
            medication_stopped=medication_stopped,
            missed_dose_count=missed_dose_count,
            supply_remaining=supply_remaining,
            difficulty_reported=difficulty_reported,
            systolic=systolic,
            diastolic=diastolic,
        )
    )
    summary = generate_fallback_summary(
        medication_stopped=medication_stopped,
        missed_dose_count=missed_dose_count,
        supply_bucket_label=SUPPLY_LABELS[supply_bucket],
        systolic=systolic,
        diastolic=diastolic,
        difficulty_reported=difficulty_reported,
        difficulty_text=difficulty_text,
    )

    conn.execute(
        """INSERT INTO demo_checkins
           (id, patient_id, missed_doses, missed_dose_count, medication_stopped,
            supply_bucket, supply_remaining, systolic, diastolic,
            difficulty_reported, difficulty_text, patient_submitted_at,
            risk_level, reason_codes, rule_version, summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            patient_id,
            int(missed_doses),
            missed_dose_count,
            int(medication_stopped),
            supply_bucket,
            int(supply_remaining),
            systolic,
            diastolic,
            int(difficulty_reported),
            difficulty_text,
            _days_ago(days_ago),
            rule_result.risk_level,
            __import__("json").dumps(rule_result.reason_codes),
            rule_result.rule_version,
            summary,
            _days_ago(days_ago),
        ),
    )


def ensure_seeded() -> None:
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM demo_patients WHERE id = ?", (DEMO_PATIENT_ID,)
        ).fetchone()
        if existing:
            return

        # --- Provider ---
        conn.execute(
            "INSERT INTO demo_providers (id, name, email, clinic) VALUES (?, ?, ?, ?)",
            (DEMO_PROVIDER_ID, "Dr. Anjali Silva", "anjali.silva@clinic.lk", "Colombo Clinic"),
        )

        # --- Patient 1: Nimal Perera — used for live mobile testing too,
        # so no pre-seeded check-in here; his medications match the
        # Patient.png wireframe exactly. ---
        _insert_patient(conn, DEMO_PATIENT_ID, "Nimal Perera", "nimal.perera@example.com", 58)
        _insert_medications(
            conn,
            DEMO_PATIENT_ID,
            [
                ("Amlodipine 5 mg", "Take one tablet", "8:00 PM", 1),
                ("Losartan 50 mg", "Take one tablet", "8:00 AM", 1),
                ("Hydrochlorothiazide 12.5 mg", "Take one tablet", "8:00 AM", 0),
            ],
        )

        # --- Patient 2: Kamala Fernando — medium risk, low supply ---
        p2 = "demo-patient-kamala"
        _insert_patient(conn, p2, "Kamala Fernando", "kamala.fernando@example.com", 63)
        _insert_medications(
            conn, p2, [("Losartan 50 mg", "Take one tablet", "8:00 AM", 1)]
        )
        _insert_bp(conn, p2, 149, 92, days_ago=5)
        _insert_checkin(
            conn, p2,
            medication_stopped=False, missed_dose_count=1, supply_bucket="0-2",
            difficulty_reported=False, difficulty_text=None,
            systolic=149, diastolic=92, days_ago=5,
        )

        # --- Patient 3: Sunil Jayasinghe — no check-in yet (pending review state) ---
        p3 = "demo-patient-sunil"
        _insert_patient(conn, p3, "Sunil Jayasinghe", "sunil.jayasinghe@example.com", 70)
        _insert_medications(
            conn, p3, [("Amlodipine 10 mg", "Take one tablet", "8:00 AM", 1)]
        )
        # Deliberately no BP, no check-in — demonstrates the "pending" / empty state.

        # --- Patient 4: Priyani Silva — low risk, adherent ---
        p4 = "demo-patient-priyani"
        _insert_patient(conn, p4, "Priyani Silva", "priyani.silva@example.com", 54)
        _insert_medications(
            conn, p4, [("Losartan 25 mg", "Take one tablet", "8:00 AM", 1)]
        )
        _insert_bp(conn, p4, 132, 84, days_ago=4)
        _insert_checkin(
            conn, p4,
            medication_stopped=False, missed_dose_count=0, supply_bucket="7+",
            difficulty_reported=False, difficulty_text=None,
            systolic=132, diastolic=84, days_ago=4,
        )

        # --- Patient 5: Ruwan Bandara — high risk, stopped medication ---
        p5 = "demo-patient-ruwan"
        _insert_patient(conn, p5, "Ruwan Bandara", "ruwan.bandara@example.com", 61)
        _insert_medications(
            conn, p5, [("Amlodipine 5 mg", "Take one tablet", "8:00 PM", 0)]
        )
        _insert_bp(conn, p5, 158, 96, days_ago=3)
        _insert_checkin(
            conn, p5,
            medication_stopped=True, missed_dose_count=0, supply_bucket="7+",
            difficulty_reported=True, difficulty_text="Ran out and could not get to the pharmacy.",
            systolic=158, diastolic=96, days_ago=3,
        )

        # --- Patient 6: Chamari Wickramasinghe — high risk, elevated BP ---
        p6 = "demo-patient-chamari"
        _insert_patient(conn, p6, "Chamari Wickramasinghe", "chamari.w@example.com", 66)
        _insert_medications(
            conn, p6, [("Hydrochlorothiazide 12.5 mg", "Take one tablet", "8:00 AM", 1)]
        )
        _insert_bp(conn, p6, 184, 118, days_ago=2)
        _insert_checkin(
            conn, p6,
            medication_stopped=False, missed_dose_count=1, supply_bucket="3-6",
            difficulty_reported=False, difficulty_text=None,
            systolic=184, diastolic=118, days_ago=2,
        )

        conn.commit()
    finally:
        conn.close()
