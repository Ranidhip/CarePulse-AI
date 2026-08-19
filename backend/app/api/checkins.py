"""
Weekly check-in endpoints — the core tracer-bullet route.

Flow (see docs/01-erd-api-contract.md §6 and the architecture plan §5):
  patient submits -> validate -> store original answers ->
  deterministic rule engine -> three-agent workflow (if enabled) ->
  combine risk (agents can only RAISE it) -> store risk assessment ->
  create alert if needed -> return response

Phase 4 change: the single-call AI adapter from Phase 3
(app.services.ai.analysis.run_ai_analysis) is replaced by the three-agent
orchestrator (app.services.agents.orchestrator.run_agent_workflow). The
route is now `async def` because Runner.run() is async. Gating,
fallback, and "never lower rule-derived risk" behavior are unchanged in
spirit from Phase 3 — only the mechanism producing the AI result changed.

settings.ai_enabled still defaults to False — unchanged behavior until
explicitly turned on. The entire agent-workflow block, including model
selection, is wrapped in its own try/except so ANY failure there
degrades to the same rule-only fallback, never a 500 — AI (agentic or
not) is never allowed to block a check-in from being stored.

get_supabase_client is taken via Depends() so tests can override it with
a fake client. get_agent_model is deliberately NOT a FastAPI dependency —
see app/services/agents/client.py's docstring — tests monkeypatch it at
the module level instead.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.api.deps import require_patient
from app.core.config import get_settings
from app.core.db import one_or_none
from app.core.security import CurrentUser, get_supabase_client
from app.models.checkins import (
    CheckInCreateRequest,
    CheckInCreateResponse,
    CheckInLatestResponse,
    CheckInRecord,
    RiskAssessmentSummary,
)
from app.services.agents.client import get_agent_model
from app.services.agents.orchestrator import AgentWorkflowOutcome, run_agent_workflow
from app.services.ai.summary import generate_fallback_summary
from app.services.patients import get_patient_profile_id
from app.services.rules.engine import RuleInput, evaluate

router = APIRouter()

# low < medium < high — used to combine the rule result with the AI
# suggestion without ever letting AI lower what the rule engine decided.
RISK_LEVEL_ORDER = {"low": 0, "medium": 1, "high": 2}


@router.post(
    "/patient/check-ins",
    response_model=CheckInCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_check_in(
    payload: CheckInCreateRequest,
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    settings = get_settings()
    patient_id = get_patient_profile_id(supabase, user.id)

    # Idempotency: if this exact key was already submitted, return the
    # existing result instead of creating a duplicate (architecture plan
    # §10.3 - "duplicate request" recovery behaviour). This also means a
    # retried request never re-runs the agent workflow a second time —
    # this check fires BEFORE the orchestrator is ever called.
    existing_row = one_or_none(
        supabase.table("weekly_check_ins")
        .select("id")
        .eq("idempotency_key", payload.idempotency_key)
    )
    if existing_row is not None:
        check_in_id = existing_row["id"]
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

    # 1. Store the original check-in exactly as submitted. Nothing below
    # this point — including any agent-workflow failure — ever un-stores
    # this.
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

    # 3. Run the deterministic rule engine — the safety floor. Nothing
    # below this point can ever produce a final_level below this.
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

    # 4. Run the three-agent workflow if enabled. Every variable below
    # has a safe default matching the "AI disabled" behavior; the two
    # branches below only ever improve on it (workflow completed) or
    # fall back to a rule-only result plus a deterministic summary
    # (workflow failed or was blocked by the safety backstop).
    ai_status = "pending"
    ai_suggested_level: str | None = None
    ai_confidence: float | None = None
    final_level = rule_result.risk_level
    requires_manual_review = False
    provider_summary: str | None = None
    model_version: str | None = None
    ai_reason_evidence: list[tuple[str, str | None]] = []

    if settings.ai_enabled:
        try:
            model = get_agent_model()
            outcome: AgentWorkflowOutcome = await run_agent_workflow(
                supabase,
                check_in_id=check_in_id,
                patient_id=patient_id,
                rule_result_level=rule_result.risk_level,
                difficulty_text=payload.difficulty_text,
                missed_doses=payload.missed_doses,
                missed_dose_count=payload.missed_dose_count,
                medication_stopped=payload.medication_stopped,
                supply_remaining=payload.supply_remaining,
                model=model,
                model_label=settings.openai_model,
                timeout_seconds=settings.ai_timeout_seconds,
            )
        except Exception:
            # Catches anything not already caught inside run_agent_workflow
            # itself — e.g. model-selection failing. The agent workflow is
            # never allowed to fail the check-in request.
            outcome = AgentWorkflowOutcome(
                status="failed",
                ai_status="failed",
                final_level=rule_result.risk_level,
                requires_manual_review=True,
                provider_summary=None,
                analysis=None,
                error_code="AGENT_WORKFLOW_CLIENT_ERROR",
            )

        if outcome.ai_status == "completed" and outcome.analysis is not None:
            ai_status = "completed"
            ai_suggested_level = outcome.analysis.suggested_risk_level
            ai_confidence = outcome.analysis.confidence
            model_version = outcome.model_version
            requires_manual_review = outcome.requires_manual_review
            provider_summary = outcome.provider_summary
            final_level = outcome.final_level
            ai_reason_evidence = outcome.reason_evidence
        else:
            ai_status = "failed"
            requires_manual_review = True
            provider_summary = generate_fallback_summary(
                medication_stopped=payload.medication_stopped,
                missed_dose_count=payload.missed_dose_count,
                supply_bucket_label=(
                    "some remaining" if payload.supply_remaining else "none remaining"
                ),
                systolic=payload.systolic,
                diastolic=payload.diastolic,
                difficulty_reported=payload.difficulty_reported,
                difficulty_text=payload.difficulty_text,
            )
            # final_level intentionally stays at rule_result.risk_level.

    # 5. Store the assessment.
    assessment_insert = (
        supabase.table("risk_assessments")
        .insert(
            {
                "check_in_id": check_in_id,
                "rule_result_level": rule_result.risk_level,
                "rule_version": rule_result.rule_version,
                "ai_suggested_level": ai_suggested_level,
                "ai_confidence": ai_confidence,
                "requires_manual_review": requires_manual_review,
                "final_level": final_level,
                "provider_summary": provider_summary,
                "ai_status": ai_status,
                "model_version": model_version,
            }
        )
        .execute()
    )
    assessment_id = assessment_insert.data[0]["id"]

    # Rule-derived reasons are always recorded.
    for code in rule_result.reason_codes:
        supabase.table("risk_reasons").insert(
            {"risk_assessment_id": assessment_id, "reason_code": code, "source": "rule"}
        ).execute()

    # AI-derived reasons are recorded only when the workflow actually
    # completed AND passed the safety gate (run_agent_workflow only
    # populates reason_evidence in that case — see orchestrator.py).
    for code, evidence_text in ai_reason_evidence:
        supabase.table("risk_reasons").insert(
            {
                "risk_assessment_id": assessment_id,
                "reason_code": code,
                "source": "ai",
                "evidence_text": evidence_text,
            }
        ).execute()

    # 6. Create a provider alert for medium/high results — uses the
    # FINAL level (rule vs AI, whichever is higher), so an AI-raised risk
    # still reaches a provider even when the rule engine alone said low.
    if final_level in ("medium", "high"):
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
            final_level=final_level,
            ai_status=ai_status,
        ),
        message=(
            "Check-in received. Analysis in progress."
            if ai_status == "pending"
            else "Check-in received."
        ),
    )


@router.get("/patient/check-ins")
def list_own_check_ins(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)

    result = (
        supabase.table("weekly_check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("server_received_at", desc=True)
        .execute()
    )
    return {"check_ins": result.data}


@router.get("/patient/check-ins/latest", response_model=CheckInLatestResponse)
def latest_own_check_in(
    user: CurrentUser = Depends(require_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_id = get_patient_profile_id(supabase, user.id)

    check_in_result = (
        supabase.table("weekly_check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("server_received_at", desc=True)
        .limit(1)
        .execute()
    )
    if not check_in_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No check-in submitted yet"
        )
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

    return CheckInLatestResponse(
        check_in=CheckInRecord(**check_in_row),
        risk_assessment=RiskAssessmentSummary(
            rule_result_level=assessment_row["rule_result_level"] if assessment_row else "low",
            final_level=assessment_row["final_level"] if assessment_row else "low",
            ai_status=assessment_row["ai_status"] if assessment_row else "pending",
        ),
    )
