"""
Phase 4 agent orchestration.

Sequential workflow (per the master brief's AGENT ORCHESTRATION section,
implemented manually rather than via the SDK's automatic handoffs, so the
safety gate stays as code this project directly controls):

  1. Load or create the agent_runs row (upsert on check_in_id — see
     _upsert_agent_run_running; the unique(check_in_id) DB constraint
     alone does NOT handle re-entrancy, this function does).
  2. If an agent_runs row for this check_in_id is already
     completed/manual_review, return that outcome without calling any
     model or creating any duplicate action/task — idempotency backstop
     for direct re-invocation, independent of checkins.py's own
     idempotency_key check (which is what actually prevents this from
     firing during ordinary HTTP retries).
  3. Run CheckInAnalysisAgent -> AIResponse (reused from Phase 3).
  4. Run FollowUpCoordinatorAgent -> FollowUpCoordinatorOutput.
  5. Run ClinicalSafetyAgent -> ClinicalSafetyOutput.
  6. Run the deterministic Python safety backstop regardless of what
     ClinicalSafetyAgent said (app.services.agents.safety).
  7. Only if BOTH approve, and only if the coordinator asked for one,
     create a follow_up_tasks row.
  8. Finalize agent_runs (completed/manual_review/failed).

Every step 3-5 call is wrapped in its own bounded timeout
(asyncio.wait_for) on top of each Agent's own ModelSettings(timeout=...),
and max_turns is capped on every Runner.run() call. Any failure at any
point — timeout, max turns exceeded, model error, invalid/unparseable
output, or any other exception — is caught, recorded, and produces a
"failed" outcome. Nothing here ever raises out to the caller
(app/api/checkins.py), matching the same "AI must never block the
check-in" guarantee Phase 3 established.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from agents import RunConfig, Runner
from agents.exceptions import MaxTurnsExceeded, ModelBehaviorError, ModelTimeoutError

from app.core.db import one_or_none
from app.services.agents.definitions import (
    build_check_in_analysis_agent,
    build_clinical_safety_agent,
    build_follow_up_coordinator_agent,
)
from app.services.agents.safety import deterministic_safety_check
from app.services.agents.schemas import ClinicalSafetyOutput, FollowUpCoordinatorOutput
from app.services.ai.prompts import build_user_message
from app.services.ai.schemas import AIResponse

logger = logging.getLogger(__name__)

RISK_LEVEL_ORDER = {"low": 0, "medium": 1, "high": 2}
MAX_TURNS_PER_AGENT = 4


@dataclass
class AgentWorkflowOutcome:
    status: str  # "completed" | "manual_review" | "failed"
    ai_status: str  # "completed" | "failed" — mirrors risk_assessments.ai_status
    final_level: str
    requires_manual_review: bool
    provider_summary: str | None
    analysis: AIResponse | None
    reason_evidence: list[tuple[str, str | None]] = field(default_factory=list)
    model_version: str | None = None
    error_code: str | None = None
    duplicate: bool = False


def _upsert_agent_run_running(supabase, check_in_id: str, patient_id: str, model_label: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("agent_runs")
        .upsert(
            {
                "check_in_id": check_in_id,
                "patient_id": patient_id,
                "status": "running",
                "model": model_label,
                "started_at": now,
                "completed_at": None,
                "error_code": None,
            },
            on_conflict="check_in_id",
        )
        .execute()
    )
    return result.data[0]


def _finalize_agent_run(supabase, agent_run_id: str, *, status: str, error_code: str | None) -> None:
    supabase.table("agent_runs").update(
        {
            "status": status,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "error_code": error_code,
        }
    ).eq("id", agent_run_id).execute()


def _record_action(
    supabase,
    agent_run_id: str,
    agent_name: str,
    action_type: str,
    *,
    tool_input: dict | None = None,
    tool_output: dict | None = None,
    status: str = "success",
    requires_provider_approval: bool = False,
) -> None:
    supabase.table("agent_actions").insert(
        {
            "agent_run_id": agent_run_id,
            "agent_name": agent_name,
            "action_type": action_type,
            "tool_name": action_type,
            "tool_input": tool_input or {},
            "tool_output": tool_output,
            "status": status,
            "requires_provider_approval": requires_provider_approval,
        }
    ).execute()


_RUN_STATUS_TO_AI_STATUS = {"completed": "completed", "manual_review": "completed", "failed": "failed"}


def _load_existing_outcome_if_finished(
    supabase, check_in_id: str, rule_result_level: str
) -> AgentWorkflowOutcome | None:
    """
    Idempotency backstop: if this check_in_id's agent_runs row is already
    completed or manual_review, return that outcome instead of running
    anything again. Never fires during ordinary HTTP retries — those are
    already stopped earlier, by checkins.py's own idempotency_key check,
    before this function is ever called. This exists for direct/
    out-of-band re-invocation of the orchestrator itself.
    """
    existing_run = one_or_none(supabase.table("agent_runs").select("*").eq("check_in_id", check_in_id))
    if existing_run is None or existing_run["status"] not in ("completed", "manual_review"):
        return None

    assessment = one_or_none(
        supabase.table("risk_assessments")
        .select("final_level, ai_status, provider_summary, requires_manual_review")
        .eq("check_in_id", check_in_id)
        .order("created_at", desc=True)
    )
    return AgentWorkflowOutcome(
        status=existing_run["status"],
        ai_status=(
            assessment["ai_status"]
            if assessment
            else _RUN_STATUS_TO_AI_STATUS.get(existing_run["status"], "failed")
        ),
        final_level=(assessment["final_level"] if assessment else rule_result_level),
        requires_manual_review=(assessment["requires_manual_review"] if assessment else True),
        provider_summary=(assessment["provider_summary"] if assessment else None),
        analysis=None,
        model_version=existing_run.get("model"),
        error_code=existing_run.get("error_code"),
        duplicate=True,
    )


async def _run_agent_bounded(agent, input_text: str, *, timeout_seconds: float):
    """
    Runs one agent with both a max_turns cap and an application-level
    wall-clock timeout on top of the agent's own ModelSettings(timeout=).
    Lets MaxTurnsExceeded / ModelTimeoutError / ModelBehaviorError /
    asyncio.TimeoutError / anything else propagate — the caller
    (run_agent_workflow) catches broadly and converts to a failed outcome.
    """
    return await asyncio.wait_for(
        Runner.run(
            agent,
            input=input_text,
            max_turns=MAX_TURNS_PER_AGENT,
            run_config=RunConfig(tracing_disabled=True),
        ),
        timeout=timeout_seconds,
    )


async def run_agent_workflow(
    supabase,
    *,
    check_in_id: str,
    patient_id: str,
    rule_result_level: str,
    difficulty_text: str | None,
    missed_doses: bool,
    missed_dose_count: int | None,
    medication_stopped: bool,
    supply_remaining: bool,
    model,
    model_label: str,
    timeout_seconds: float = 20.0,
) -> AgentWorkflowOutcome:
    """
    `model` is the DI point: a model-name string in production, a fake
    agents.Model instance in tests (see app/tests/agents_fakes.py).
    `model_label` is always a plain string, used only for the agent_runs
    audit column and error messages — never passed to the SDK as a model.
    """
    existing = _load_existing_outcome_if_finished(supabase, check_in_id, rule_result_level)
    if existing is not None:
        return existing

    run_row = _upsert_agent_run_running(supabase, check_in_id, patient_id, model_label)
    agent_run_id = run_row["id"]

    try:
        # --- 1. CheckInAnalysisAgent ---------------------------------
        analysis_agent = build_check_in_analysis_agent(model, timeout_seconds)
        analysis_input = build_user_message(
            difficulty_text=difficulty_text,
            missed_doses=missed_doses,
            missed_dose_count=missed_dose_count,
            medication_stopped=medication_stopped,
            supply_remaining=supply_remaining,
        )
        analysis_result = await _run_agent_bounded(
            analysis_agent, analysis_input, timeout_seconds=timeout_seconds
        )
        analysis: AIResponse = analysis_result.final_output_as(AIResponse)
        _record_action(
            supabase,
            agent_run_id,
            "CheckInAnalysisAgent",
            "analyze_check_in",
            tool_output=analysis.model_dump(mode="json"),
        )

        # --- 2. FollowUpCoordinatorAgent ------------------------------
        coordinator_agent = build_follow_up_coordinator_agent(model, timeout_seconds)
        coordinator_input = (
            f"Rule-engine risk level (authoritative floor): {rule_result_level}\n"
            f"CheckInAnalysisAgent suggested risk level: {analysis.suggested_risk_level}\n"
            f"Reason codes: {', '.join(analysis.reason_codes)}\n"
            f"Provider summary so far: {analysis.provider_summary}\n"
            f"Analysis confidence: {analysis.confidence}\n"
            f"Analysis flagged for manual review: {analysis.requires_manual_review}"
        )
        coordinator_result = await _run_agent_bounded(
            coordinator_agent, coordinator_input, timeout_seconds=timeout_seconds
        )
        coordination: FollowUpCoordinatorOutput = coordinator_result.final_output_as(
            FollowUpCoordinatorOutput
        )
        _record_action(
            supabase,
            agent_run_id,
            "FollowUpCoordinatorAgent",
            "coordinate_follow_up",
            tool_output=coordination.model_dump(mode="json"),
        )

        # --- 3. ClinicalSafetyAgent ------------------------------------
        safety_agent = build_clinical_safety_agent(model, timeout_seconds)
        safety_input = (
            f"Proposed provider summary: {analysis.provider_summary}\n"
            f"Proposed follow-up: create_task={coordination.create_task}, "
            f"task_type={coordination.task_type}, priority={coordination.priority}, "
            f"rationale={coordination.rationale}"
        )
        safety_result = await _run_agent_bounded(
            safety_agent, safety_input, timeout_seconds=timeout_seconds
        )
        safety: ClinicalSafetyOutput = safety_result.final_output_as(ClinicalSafetyOutput)
        _record_action(
            supabase,
            agent_run_id,
            "ClinicalSafetyAgent",
            "validate_safety",
            tool_output=safety.model_dump(mode="json"),
            requires_provider_approval=not safety.approved,
        )

        # --- 4. Deterministic backstop — regardless of the agent's own
        # verdict. This is the actual safety gate, not the agent alone.
        backstop_ok, backstop_reason = deterministic_safety_check(analysis.provider_summary)
        approved = safety.approved and backstop_ok
        if not backstop_ok:
            _record_action(
                supabase,
                agent_run_id,
                "ClinicalSafetyAgent",
                "deterministic_backstop",
                tool_output={"passed": False, "reason": backstop_reason},
                status="failed",
                requires_provider_approval=True,
            )

        final_level = max(
            rule_result_level, analysis.suggested_risk_level, key=lambda lvl: RISK_LEVEL_ORDER[lvl]
        )
        requires_manual_review = analysis.requires_manual_review or not approved

        reason_evidence: list[tuple[str, str | None]] = []
        if approved:
            evidence_by_code = {e.reason_code: e.text for e in analysis.evidence}
            for code in analysis.reason_codes:
                reason_evidence.append((code, evidence_by_code.get(code)))

        # --- 5. Follow-up task — ONLY if both the agent and the
        # deterministic backstop approve, per requirement #8.
        if approved and coordination.create_task and coordination.task_type and coordination.priority:
            supabase.table("follow_up_tasks").insert(
                {
                    "patient_id": patient_id,
                    "agent_run_id": agent_run_id,
                    "task_type": coordination.task_type,
                    "priority": coordination.priority,
                    "rationale": coordination.rationale,
                    "status": "pending",
                }
            ).execute()

        final_run_status = "completed" if approved else "manual_review"
        _finalize_agent_run(supabase, agent_run_id, status=final_run_status, error_code=None)

        return AgentWorkflowOutcome(
            status=final_run_status,
            ai_status="completed",
            final_level=final_level,
            requires_manual_review=requires_manual_review,
            provider_summary=analysis.provider_summary,
            analysis=analysis,
            reason_evidence=reason_evidence,
            model_version=model_label,
            error_code=None if approved else (backstop_reason or safety.rejection_reason),
        )

    except asyncio.TimeoutError:
        return _fail(supabase, agent_run_id, rule_result_level, "AGENT_TIMEOUT")
    except MaxTurnsExceeded:
        return _fail(supabase, agent_run_id, rule_result_level, "AGENT_MAX_TURNS_EXCEEDED")
    except ModelTimeoutError:
        return _fail(supabase, agent_run_id, rule_result_level, "AGENT_MODEL_TIMEOUT")
    except ModelBehaviorError:
        return _fail(supabase, agent_run_id, rule_result_level, "AGENT_INVALID_OUTPUT")
    except Exception as e:
        logger.exception("Agent workflow failed: unexpected error")
        return _fail(supabase, agent_run_id, rule_result_level, f"AGENT_UNEXPECTED_ERROR:{type(e).__name__}")


def _fail(supabase, agent_run_id: str, rule_result_level: str, error_code: str) -> AgentWorkflowOutcome:
    logger.warning("Agent workflow failed: %s", error_code)
    _finalize_agent_run(supabase, agent_run_id, status="failed", error_code=error_code)
    return AgentWorkflowOutcome(
        status="failed",
        ai_status="failed",
        final_level=rule_result_level,
        requires_manual_review=True,
        provider_summary=None,
        analysis=None,
        error_code=error_code,
    )
