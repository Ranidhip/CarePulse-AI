"""
Production patient routes beyond check-ins (which live in checkins.py):
home, profile, medications, BP readings, and combined history.

Every route here follows the same shape as checkins.py: resolve the
caller's patient_profiles.id, then query only rows scoped to that id.
The Supabase client is taken via Depends(get_supabase_client) so tests
can override it with a fake client instead of hitting a real project.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.api.deps import require_patient
from app.core.db import one_or_none
from app.core.security import CurrentUser, get_supabase_client
from app.models.checkins import CheckInRecord, RiskAssessmentSummary
from app.models.common import BPReadingCreateRequest, BPReadingOut, MedicationOut, PatientProfileOut
from app.models.patient import PatientHistoryEntryOut, PatientHomeOut
from app.services.patients import get_patient_profile_id

router = APIRouter()


def _latest_check_in_with_risk(supabase: Client, patient_id: str):
    """Shared by /patient/home and /patient/history."""
    check_in_result = (
        supabase.table("weekly_check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("server_received_at", desc=True)
        .limit(1)
        .execute()
    )
    if not check_in_result.data:
        return None, None
    check_in_row = check_in_result.data[0]

    assessment_result = (
        supabase.table("risk_assessments")
        .select("rule_result_level, final_level, ai_status")
        .eq("check_in_id", check_in_row["id"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    assessment_row = assessment_result.data[0] if assessment_result.data else None
    risk = (
        RiskAssessmentSummary(
            rule_result_level=assessment_row["rule_result_level"],
            final_level=assessment_row["final_level"],
            ai_status=assessment_row["ai_status"],
        )
        if assessment_row
        else None
    )
    return CheckInRecord(**check_in_row), risk


def _latest_bp(supabase: Client, patient_id: str) -> BPReadingOut | None:
    result = (
        supabase.table("blood_pressure_readings")
        .select("id, systolic, diastolic, measured_at, recorded_at")
        .eq("patient_id", patient_id)
        .order("measured_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return BPReadingOut(**result.data[0])


@router.get("/patient/home", response_model=PatientHomeOut)
def patient_home(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)

    profile_row = one_or_none(
        supabase.table("patient_profiles").select("full_name").eq("id", patient_id)
    )
    if profile_row is None:
        # patient_id was just confirmed to exist by get_patient_profile_id()
        # above — reaching here would mean the row vanished in between.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient profile not found"
        )

    medications_result = (
        supabase.table("medication_schedules")
        .select("id, medication_name, dosage_description, scheduled_time, supply_status")
        .eq("patient_id", patient_id)
        .execute()
    )

    check_in, risk = _latest_check_in_with_risk(supabase, patient_id)
    latest_bp = _latest_bp(supabase, patient_id)

    return PatientHomeOut(
        full_name=profile_row["full_name"],
        medications=[MedicationOut(**m) for m in medications_result.data],
        latest_check_in=check_in,
        latest_check_in_risk=risk,
        latest_bp=latest_bp,
    )


@router.get("/patient/profile", response_model=PatientProfileOut)
def patient_profile(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)

    profile_row = one_or_none(
        supabase.table("patient_profiles")
        .select("id, full_name, age, contact_number")
        .eq("id", patient_id)
    )
    if profile_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient profile not found"
        )
    return PatientProfileOut(**profile_row, email=user.email)


@router.get("/patient/medications", response_model=list[MedicationOut])
def patient_medications(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)

    result = (
        supabase.table("medication_schedules")
        .select("id, medication_name, dosage_description, scheduled_time, supply_status")
        .eq("patient_id", patient_id)
        .execute()
    )
    return [MedicationOut(**m) for m in result.data]


@router.post(
    "/patient/bp-readings", response_model=BPReadingOut, status_code=status.HTTP_201_CREATED
)
def create_bp_reading(
    body: BPReadingCreateRequest,
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)
    measured_at = body.measured_at or datetime.now(timezone.utc)

    result = (
        supabase.table("blood_pressure_readings")
        .insert(
            {
                "patient_id": patient_id,
                "systolic": body.systolic,
                "diastolic": body.diastolic,
                "measured_at": measured_at.isoformat(),
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )
    return BPReadingOut(**result.data[0])


@router.get("/patient/bp-readings", response_model=list[BPReadingOut])
def list_bp_readings(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)

    result = (
        supabase.table("blood_pressure_readings")
        .select("id, systolic, diastolic, measured_at, recorded_at")
        .eq("patient_id", patient_id)
        .order("measured_at", desc=True)
        .execute()
    )
    return [BPReadingOut(**r) for r in result.data]


@router.get("/patient/bp-readings/latest", response_model=BPReadingOut)
def latest_bp_reading(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)
    reading = _latest_bp(supabase, patient_id)
    if reading is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No BP reading recorded yet"
        )
    return reading


@router.get("/patient/history", response_model=list[PatientHistoryEntryOut])
def patient_history(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Merged, reverse-chronological view of the patient's own check-ins and
    BP readings. Shows only what the patient already submitted plus the
    same restricted risk summary already returned at submission time
    (rule_result_level / final_level / ai_status) — never reason codes,
    evidence text, or provider_summary, which stay provider-only.
    """
    patient_id = get_patient_profile_id(supabase, user.id)

    check_ins_result = (
        supabase.table("weekly_check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("server_received_at", desc=True)
        .execute()
    )
    bp_result = (
        supabase.table("blood_pressure_readings")
        .select("id, systolic, diastolic, measured_at, recorded_at")
        .eq("patient_id", patient_id)
        .order("measured_at", desc=True)
        .execute()
    )

    entries: list[PatientHistoryEntryOut] = []

    for row in check_ins_result.data:
        assessment_result = (
            supabase.table("risk_assessments")
            .select("rule_result_level, final_level, ai_status")
            .eq("check_in_id", row["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        assessment_row = assessment_result.data[0] if assessment_result.data else None
        entries.append(
            PatientHistoryEntryOut(
                entry_type="check_in",
                occurred_at=row["server_received_at"],
                check_in=CheckInRecord(**row),
                check_in_risk=(
                    RiskAssessmentSummary(
                        rule_result_level=assessment_row["rule_result_level"],
                        final_level=assessment_row["final_level"],
                        ai_status=assessment_row["ai_status"],
                    )
                    if assessment_row
                    else None
                ),
            )
        )

    for row in bp_result.data:
        entries.append(
            PatientHistoryEntryOut(
                entry_type="bp_reading",
                occurred_at=row["measured_at"],
                bp_reading=BPReadingOut(**row),
            )
        )

    entries.sort(key=lambda e: e.occurred_at, reverse=True)
    return entries
