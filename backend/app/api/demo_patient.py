"""
Demo-mode patient routes. Mounted at /demo/* only when settings.demo_mode
is True (see main.py) — a completely separate path from the production
Supabase-backed routes in app/api/checkins.py and app/api/me.py.

Risk is calculated with the SAME rule engine the production route uses
(app.services.rules.engine.evaluate) — there is exactly one risk-
calculation source of truth in this codebase, demo mode or not.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.demo import repository, seed
from app.demo.auth import get_demo_current_patient
from app.services.ai.summary import generate_fallback_summary
from app.services.rules.engine import RuleInput, evaluate

router = APIRouter(prefix="/demo", tags=["demo"])

SUPPLY_LABELS = {
    "7+": "7 days or more",
    "3-6": "3-6 days",
    "0-2": "0-2 days",
    "none": "No medicine remaining",
}


# --- Auth ---------------------------------------------------------------


class DemoSignInRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


@router.post("/auth/sign-in")
def demo_sign_in(body: DemoSignInRequest) -> dict:
    """
    Demo authentication only: accepts any non-empty email/password and
    signs the caller in as the seeded demo patient. Not real auth — see
    app/demo/auth.py.
    """
    seed.ensure_seeded()
    patient = repository.find_patient_by_email(body.email) or repository.get_patient(
        seed.DEMO_PATIENT_ID
    )
    if patient is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Demo patient not seeded")
    return {
        "access_token": patient["id"],
        "patient": {
            "id": patient["id"],
            "name": patient["name"],
            "email": patient["email"],
            "age": patient["age"],
        },
    }


# --- Home / medications ---------------------------------------------------


@router.get("/patient/home")
def get_home(patient: dict = Depends(get_demo_current_patient)) -> dict:
    medications = repository.list_medications(patient["id"])
    latest_checkin = repository.get_latest_checkin(patient["id"])
    latest_bp = repository.get_latest_bp_reading(patient["id"])
    return {
        "patient": {"id": patient["id"], "name": patient["name"], "age": patient["age"]},
        "nextMedication": medications[0] if medications else None,
        "latestCheckIn": latest_checkin,
        "latestBP": latest_bp,
    }


@router.get("/patient/medications")
def get_medications(patient: dict = Depends(get_demo_current_patient)) -> list[dict]:
    return repository.list_medications(patient["id"])


# --- Blood pressure ---------------------------------------------------


class BPReadingRequest(BaseModel):
    systolic: int = Field(..., ge=40, le=300)
    diastolic: int = Field(..., ge=20, le=200)
    pulse: int | None = Field(default=None, ge=20, le=250)
    measured_at: str
    notes: str | None = None


@router.post("/patient/bp")
def save_bp_reading(
    body: BPReadingRequest, patient: dict = Depends(get_demo_current_patient)
) -> dict:
    return repository.add_bp_reading(
        patient_id=patient["id"],
        systolic=body.systolic,
        diastolic=body.diastolic,
        pulse=body.pulse,
        measured_at=body.measured_at,
        notes=body.notes,
    )


@router.get("/patient/bp/latest")
def get_latest_bp(patient: dict = Depends(get_demo_current_patient)) -> dict | None:
    return repository.get_latest_bp_reading(patient["id"])


# --- Weekly check-in ---------------------------------------------------


class CheckInRequest(BaseModel):
    missed_doses: bool
    missed_dose_count: int | None = Field(default=None, ge=0)
    medication_stopped: bool
    supply_bucket: str  # "7+" | "3-6" | "0-2" | "none"
    difficulty_reported: bool
    difficulty_text: str | None = Field(default=None, max_length=300)
    patient_submitted_at: datetime


@router.post("/patient/check-ins")
def submit_checkin(
    body: CheckInRequest, patient: dict = Depends(get_demo_current_patient)
) -> dict:
    if body.supply_bucket not in SUPPLY_LABELS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid supply_bucket")

    latest_bp = repository.get_latest_bp_reading(patient["id"])
    systolic = latest_bp["systolic"] if latest_bp else None
    diastolic = latest_bp["diastolic"] if latest_bp else None

    # supply_bucket -> the boolean the rule engine expects. Same two-state
    # distinction the engine has always used; thresholds are unchanged.
    supply_remaining = body.supply_bucket not in ("0-2", "none")

    rule_result = evaluate(
        RuleInput(
            medication_stopped=body.medication_stopped,
            missed_dose_count=body.missed_dose_count,
            supply_remaining=supply_remaining,
            difficulty_reported=body.difficulty_reported,
            systolic=systolic,
            diastolic=diastolic,
        )
    )

    supply_label = SUPPLY_LABELS[body.supply_bucket]
    summary = generate_fallback_summary(
        medication_stopped=body.medication_stopped,
        missed_dose_count=body.missed_dose_count,
        supply_bucket_label=supply_label,
        systolic=systolic,
        diastolic=diastolic,
        difficulty_reported=body.difficulty_reported,
        difficulty_text=body.difficulty_text,
    )

    saved = repository.add_checkin(
        patient_id=patient["id"],
        missed_doses=body.missed_doses,
        missed_dose_count=body.missed_dose_count,
        medication_stopped=body.medication_stopped,
        supply_bucket=body.supply_bucket,
        supply_remaining=supply_remaining,
        systolic=systolic,
        diastolic=diastolic,
        difficulty_reported=body.difficulty_reported,
        difficulty_text=body.difficulty_text,
        patient_submitted_at=body.patient_submitted_at.isoformat(),
        risk_level=rule_result.risk_level,
        reason_codes=rule_result.reason_codes,
        rule_version=rule_result.rule_version,
        summary=summary,
    )
    return saved


@router.get("/patient/check-ins/latest")
def get_latest_checkin(patient: dict = Depends(get_demo_current_patient)) -> dict | None:
    return repository.get_latest_checkin(patient["id"])


# --- History ---------------------------------------------------


@router.get("/patient/history")
def get_history(patient: dict = Depends(get_demo_current_patient)) -> dict:
    return {
        "checkIns": repository.list_checkins(patient["id"]),
        "bpReadings": repository.list_bp_readings(patient["id"]),
    }


# --- Reset ---------------------------------------------------


@router.post("/reset")
def reset_demo_data() -> dict:
    """Wipes and reseeds the demo database. No auth required — demo-only."""
    from app.demo.db import reset_db

    reset_db()
    seed.ensure_seeded()
    return {"status": "reset", "timestamp": datetime.now(timezone.utc).isoformat()}
