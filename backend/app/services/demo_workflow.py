"""Explicit, synthetic-only Phase 7 workflow demonstration data.

This module never invokes an agent or OpenAI.  It writes only to the
already-existing workflow tables and only after verifying both seeded
profiles carry the project's exact synthetic-test marker.
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.db import one_or_none

SYNTHETIC_MARKER = "(Synthetic Test Account)"
DEMO_MODEL = "synthetic-demo-no-openai"
DEMO_TOOL = "synthetic_demo_evidence"
PENDING_RATIONALE = (
    "[SYNTHETIC DEMO:PENDING] Review the synthetic adherence concern; "
    "the provider remains responsible for any follow-up decision."
)
IN_PROGRESS_RATIONALE = (
    "[SYNTHETIC DEMO:IN_PROGRESS] Review the synthetic follow-up evidence; "
    "this record is not genuine AI output."
)
DEMO_RATIONALES = {PENDING_RATIONALE, IN_PROGRESS_RATIONALE}

EXPECTED_ACTIONS = (
    ("CheckInAnalysisAgent", "analyze_check_in", False),
    ("FollowUpCoordinatorAgent", "coordinate_follow_up", False),
    ("ClinicalSafetyAgent", "validate_safety", True),
)


class DemoSafetyError(RuntimeError):
    """Raised when a synthetic-only safety precondition is not satisfied."""


@dataclass(frozen=True)
class DemoContext:
    provider_id: str
    patient_id: str
    provider_name: str
    patient_name: str


@dataclass(frozen=True)
class DemoSeedResult:
    run_id: str
    check_in_id: str
    action_count: int
    task_ids: tuple[str, ...]


@dataclass(frozen=True)
class DemoResetResult:
    run_ids: tuple[str, ...]
    action_ids: tuple[str, ...]
    task_ids: tuple[str, ...]
    deleted: bool


def _require_synthetic_name(value: str | None, label: str) -> str:
    if not value or SYNTHETIC_MARKER not in value:
        raise DemoSafetyError(f"Refusing: {label} is not an explicitly synthetic test profile")
    return value


def load_demo_context(supabase, *, provider_email: str, patient_email: str) -> DemoContext:
    provider_user = one_or_none(
        supabase.table("users").select("id, role, is_active").eq("email", provider_email)
    )
    patient_user = one_or_none(
        supabase.table("users").select("id, role, is_active").eq("email", patient_email)
    )
    if (
        not provider_user
        or provider_user.get("role") != "provider"
        or not provider_user.get("is_active")
    ):
        raise DemoSafetyError(
            "Refusing: configured provider is missing, inactive, or not a provider"
        )
    if (
        not patient_user
        or patient_user.get("role") != "patient"
        or not patient_user.get("is_active")
    ):
        raise DemoSafetyError("Refusing: configured patient is missing, inactive, or not a patient")

    provider = one_or_none(
        supabase.table("provider_profiles")
        .select("id, full_name")
        .eq("user_id", provider_user["id"])
    )
    patient = one_or_none(
        supabase.table("patient_profiles").select("id, full_name").eq("user_id", patient_user["id"])
    )
    if not provider or not patient:
        raise DemoSafetyError("Refusing: configured synthetic profiles are incomplete")
    provider_name = _require_synthetic_name(provider.get("full_name"), "provider")
    patient_name = _require_synthetic_name(patient.get("full_name"), "patient")

    assignment = one_or_none(
        supabase.table("patient_provider_assignments")
        .select("id")
        .eq("provider_id", provider["id"])
        .eq("patient_id", patient["id"])
        .eq("is_active", True)
    )
    if not assignment:
        raise DemoSafetyError(
            "Refusing: synthetic patient is not actively assigned to synthetic provider"
        )
    return DemoContext(provider["id"], patient["id"], provider_name, patient_name)


def _find_or_create_run(supabase, context: DemoContext) -> dict:
    demo_runs = (
        supabase.table("agent_runs")
        .select("*")
        .eq("patient_id", context.patient_id)
        .eq("model", DEMO_MODEL)
        .execute()
        .data
    )
    if len(demo_runs) > 1:
        raise DemoSafetyError("Refusing: multiple synthetic demo runs already exist; reset first")
    if demo_runs:
        return demo_runs[0]

    check_ins = (
        supabase.table("weekly_check_ins")
        .select("id, server_received_at")
        .eq("patient_id", context.patient_id)
        .order("server_received_at", desc=True)
        .execute()
        .data
    )
    for check_in in check_ins:
        existing = one_or_none(
            supabase.table("agent_runs").select("id, model").eq("check_in_id", check_in["id"])
        )
        if existing is None:
            now = datetime.now(timezone.utc).isoformat()
            return (
                supabase.table("agent_runs")
                .insert(
                    {
                        "check_in_id": check_in["id"],
                        "patient_id": context.patient_id,
                        "status": "completed",
                        "model": DEMO_MODEL,
                        "started_at": now,
                        "completed_at": now,
                        "error_code": None,
                    }
                )
                .execute()
                .data[0]
            )
    raise DemoSafetyError(
        "No unused synthetic check-in is available. Submit a synthetic check-in "
        "or reset the demo run."
    )


def seed_demo_workflow(supabase, context: DemoContext) -> DemoSeedResult:
    run = _find_or_create_run(supabase, context)
    if run.get("model") != DEMO_MODEL or run.get("patient_id") != context.patient_id:
        raise DemoSafetyError("Refusing to reuse a run that is not owned by the synthetic demo")

    actions = (
        supabase.table("agent_actions").select("*").eq("agent_run_id", run["id"]).execute().data
    )
    if actions:
        actual = {(a.get("agent_name"), a.get("action_type"), a.get("tool_name")) for a in actions}
        expected = {(name, action_type, DEMO_TOOL) for name, action_type, _ in EXPECTED_ACTIONS}
        if actual != expected or len(actions) != len(EXPECTED_ACTIONS):
            raise DemoSafetyError("Refusing to alter inconsistent or non-demo actions")
    else:
        for name, action_type, approval in EXPECTED_ACTIONS:
            supabase.table("agent_actions").insert(
                {
                    "agent_run_id": run["id"],
                    "agent_name": name,
                    "action_type": action_type,
                    "tool_name": DEMO_TOOL,
                    "tool_input": {},
                    "tool_output": None,
                    "status": "success",
                    "requires_provider_approval": approval,
                }
            ).execute()
        actions = (
            supabase.table("agent_actions").select("*").eq("agent_run_id", run["id"]).execute().data
        )

    all_tasks = (
        supabase.table("follow_up_tasks").select("*").eq("agent_run_id", run["id"]).execute().data
    )
    if any(task.get("rationale") not in DEMO_RATIONALES for task in all_tasks):
        raise DemoSafetyError("Refusing to alter a non-demo task attached to the demo run")
    task_by_rationale = {task["rationale"]: task for task in all_tasks}
    if len(task_by_rationale) != len(all_tasks):
        raise DemoSafetyError("Refusing: duplicate synthetic demo tasks exist; reset first")

    task_specs = (
        (PENDING_RATIONALE, "nurse_review", "high", "pending", None),
        (IN_PROGRESS_RATIONALE, "pharmacist_review", "medium", "in_progress", context.provider_id),
    )
    for rationale, task_type, priority, status, provider_id in task_specs:
        if rationale not in task_by_rationale:
            created = (
                supabase.table("follow_up_tasks")
                .insert(
                    {
                        "patient_id": context.patient_id,
                        "agent_run_id": run["id"],
                        "task_type": task_type,
                        "priority": priority,
                        "rationale": rationale,
                        "status": status,
                        "provider_id": provider_id,
                    }
                )
                .execute()
                .data[0]
            )
            task_by_rationale[rationale] = created

    return DemoSeedResult(
        run_id=run["id"],
        check_in_id=run["check_in_id"],
        action_count=len(actions),
        task_ids=tuple(
            task_by_rationale[r]["id"] for r in (PENDING_RATIONALE, IN_PROGRESS_RATIONALE)
        ),
    )


def reset_demo_workflow(supabase, context: DemoContext, *, confirm: bool) -> DemoResetResult:
    runs = (
        supabase.table("agent_runs")
        .select("*")
        .eq("patient_id", context.patient_id)
        .eq("model", DEMO_MODEL)
        .execute()
        .data
    )
    run_ids = [row["id"] for row in runs]
    actions = (
        supabase.table("agent_actions").select("*").in_("agent_run_id", run_ids).execute().data
        if run_ids
        else []
    )
    tasks = (
        supabase.table("follow_up_tasks").select("*").in_("agent_run_id", run_ids).execute().data
        if run_ids
        else []
    )
    if any(action.get("tool_name") != DEMO_TOOL for action in actions):
        raise DemoSafetyError("Refusing reset: a selected action is not synthetic demo evidence")
    if any(task.get("rationale") not in DEMO_RATIONALES for task in tasks):
        raise DemoSafetyError("Refusing reset: a selected task is not synthetic demo evidence")

    result = DemoResetResult(
        tuple(run_ids),
        tuple(row["id"] for row in actions),
        tuple(row["id"] for row in tasks),
        confirm,
    )
    if confirm:
        if result.task_ids:
            supabase.table("follow_up_tasks").delete().in_("id", result.task_ids).execute()
        if result.action_ids:
            supabase.table("agent_actions").delete().in_("id", result.action_ids).execute()
        if result.run_ids:
            supabase.table("agent_runs").delete().in_("id", result.run_ids).execute()
    return result
