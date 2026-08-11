"""
Weekly check-in endpoints — the core tracer-bullet route.

Flow (see docs/01-erd-api-contract.md §6 and the architecture plan §5):
  patient submits -> validate -> store original answers ->
  deterministic rule engine -> store risk assessment (AI status: pending) ->
  create alert if needed -> return response

AI classification is NOT called from this route yet — that gets wired in
once the OpenAI adapter is built. Until then, every assessment is created
with ai_status="pending", which is a fully valid, expected state per the
risk-combination rules: AI being absent or unavailable never blocks check-in
storage or the rule-based result.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_patient
from app.core.security import CurrentUser, get_supabase_client
from app.models.checkins import (
    CheckInCreateRequest,
    CheckInCreateResponse,
    RiskAssessmentSummary,
)
from app.services.rules.engine import RuleInput, evaluate

router = APIRouter()


def _get_patient_profile_id(supabase, user_id: str) -> str:
    result = (
        supabase.table("patient_profiles")
        .select("id")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if result.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patient profile found for this account",
        )
    return result.data["id"]


@router.post(
    "/patient/check-ins",
    response_model=CheckInCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def submit_check_in(
    payload: CheckInCreateRequest,
    user: CurrentUser = Depends(require_patient),
):
    supabase = get_supabase_client()
    patient_id = _get_patient_profile_id(supabase, user.id)

    # Idempotency: if this exact key was already submitted, return the
    # existing result instead of creating a duplicate (architecture plan
    # §10.3 - "duplicate request" recovery behaviour).
    existing = (
        supabase.table("weekly_check_ins")
        .select("id")
        .eq("idempotency_key", payload.idempotency_key)
        .maybe_single()
        .execute()
    )
    if existing.data is not None:
        check_in_id = existing.data["id"]
        assessment = (
            supabase.table("risk_assessments")
            .select("rule_result_level, final_level, ai_status")
            .eq("check_in_id", check_in_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        row = assessment.data[0] if assessment.data else None
        return CheckInCreateResponse(
            check_in_id=check_in_id,
            risk_assessment=RiskAssessmentSummary(
                rule_result_level=row["rule_result_level"] if row else "low",
                final_level=row["final_level"] if row else "low",
                ai_status=row["ai_status"] if row else "pending",
            ),
            message="Check-in already received. Returning existing result.",
        )

    # 1. Store the original check-in exactly as submitted.
    check_in_insert = (
        supabase.table("weekly_check_ins")
        .insert(
            {
                "patient_id": patient_id,
                "idempotency_key": payload.idempotency_key,
                "missed_doses": payload.missed_doses,
                "missed_dose_count": payload.missed_dose_count,
                "medication_stopped": payload.medication_stopped,
                "supply_remaining": payload.supply_remaining,
                "difficulty_reported": payload.difficulty_reported,
                "difficulty_text": payload.difficulty_text,
                "requests_contact": payload.requests_contact,
                "patient_submitted_at": payload.patient_submitted_at.isoformat(),
                "server_received_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )
    check_in_id = check_in_insert.data[0]["id"]

    # 2. Store the BP reading if provided, linked back to this check-in.
    if payload.systolic is not None and payload.diastolic is not None:
        supabase.table("blood_pressure_readings").insert(
            {
                "patient_id": patient_id,
                "systolic": payload.systolic,
                "diastolic": payload.diastolic,
                "measured_at": payload.patient_submitted_at.isoformat(),
                "recorded_at": datetime.now(timezone.utc).isoformat(),
                "source_check_in_id": check_in_id,
            }
        ).execute()

    # 3. Run the deterministic rule engine — the safety floor.
    rule_result = evaluate(
        RuleInput(
            medication_stopped=payload.medication_stopped,
            missed_dose_count=payload.missed_dose_count,
            supply_remaining=payload.supply_remaining,
            difficulty_reported=payload.difficulty_reported,
            systolic=payload.systolic,
            diastolic=payload.diastolic,
        )
    )

    # 4. Store the assessment. AI has not run yet - final_level equals the
    # rule result until/unless the (not-yet-built) AI adapter raises it.
    assessment_insert = (
        supabase.table("risk_assessments")
        .insert(
            {
                "check_in_id": check_in_id,
                "rule_result_level": rule_result.risk_level,
                "rule_version": rule_result.rule_version,
                "final_level": rule_result.risk_level,
                "ai_status": "pending",
                "requires_manual_review": False,
            }
        )
        .execute()
    )
    assessment_id = assessment_insert.data[0]["id"]

    for code in rule_result.reason_codes:
        supabase.table("risk_reasons").insert(
            {
                "risk_assessment_id": assessment_id,
                "reason_code": code,
                "source": "rule",
            }
        ).execute()

    # 5. Create a provider alert for medium/high results.
    if rule_result.risk_level in ("medium", "high"):
        supabase.table("alerts").insert(
            {
                "risk_assessment_id": assessment_id,
                "patient_id": patient_id,
                "status": "open",
            }
        ).execute()

    return CheckInCreateResponse(
        check_in_id=check_in_id,
        risk_assessment=RiskAssessmentSummary(
            rule_result_level=rule_result.risk_level,
            final_level=rule_result.risk_level,
            ai_status="pending",
        ),
        message="Check-in received. Analysis in progress.",
    )


@router.get("/patient/check-ins")
def list_own_check_ins(user: CurrentUser = Depends(require_patient)):
    supabase = get_supabase_client()
    patient_id = _get_patient_profile_id(supabase, user.id)

    result = (
        supabase.table("weekly_check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("server_received_at", desc=True)
        .execute()
    )
    return {"check_ins": result.data}
