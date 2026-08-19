"""Synthetic-provider API verification with an injectable HTTP transport."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.services.demo_workflow import DEMO_RATIONALES, SYNTHETIC_MARKER

Transport = Callable[[str, str, dict | None, str | None], tuple[int, Any]]
FORBIDDEN_AGENT_FIELDS = {
    "tool_input",
    "tool_output",
    "model",
    "error_code",
    "prompt",
    "raw_model_response",
}


class VerificationError(RuntimeError):
    pass


@dataclass(frozen=True)
class VerificationResult:
    checks: tuple[str, ...]
    transitioned_task_id: str
    resulting_status: str


def _expect(status: int, expected: int, label: str) -> None:
    if status != expected:
        raise VerificationError(f"{label} failed with HTTP {status}; expected {expected}")


def _keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value).union(*(map(_keys, value.values())))
    if isinstance(value, list):
        return set().union(*(map(_keys, value))) if value else set()
    return set()


def verify_provider_demo(
    transport: Transport, *, provider_email: str, provider_password: str
) -> VerificationResult:
    checks: list[str] = []
    status, session = transport(
        "POST", "/auth/sign-in", {"email": provider_email, "password": provider_password}, None
    )
    _expect(status, 200, "Provider sign-in")
    token = session.get("access_token") if isinstance(session, dict) else None
    if not token:
        raise VerificationError("Provider sign-in returned no access token")
    checks.append("provider sign-in")

    status, _ = transport("GET", "/provider/dashboard/summary", None, token)
    _expect(status, 200, "Dashboard summary")
    checks.append("dashboard summary")

    status, patients = transport("GET", "/provider/patients", None, token)
    _expect(status, 200, "Assigned patients")
    synthetic = [row for row in patients if SYNTHETIC_MARKER in row.get("full_name", "")]
    if len(synthetic) != 1:
        raise VerificationError("Expected exactly one accessible synthetic patient")
    patient_id = synthetic[0]["patient_id"]
    checks.append("assigned synthetic patient")

    status, detail = transport("GET", f"/provider/patients/{patient_id}", None, token)
    _expect(status, 200, "Patient detail")
    if SYNTHETIC_MARKER not in detail.get("profile", {}).get("full_name", ""):
        raise VerificationError("Refusing to continue: patient detail is not explicitly synthetic")
    checks.append("synthetic patient detail")

    status, runs = transport("GET", f"/provider/patients/{patient_id}/agent-runs", None, token)
    _expect(status, 200, "Agent runs")
    forbidden = _keys(runs).intersection(FORBIDDEN_AGENT_FIELDS)
    if forbidden:
        raise VerificationError(
            f"Provider agent response exposed forbidden fields: {sorted(forbidden)}"
        )
    checks.append("safe agent-run evidence")

    status, tasks = transport("GET", "/provider/follow-up-tasks", None, token)
    _expect(status, 200, "Follow-up tasks")
    demo_tasks = [
        row
        for row in tasks
        if row.get("patient_id") == patient_id and row.get("rationale") in DEMO_RATIONALES
    ]
    pending = next((row for row in demo_tasks if row.get("status") == "pending"), None)
    if pending is None:
        raise VerificationError("No pending synthetic demo task is available; reset and seed first")
    checks.append("visible synthetic follow-up tasks")

    status, filtered = transport("GET", "/provider/follow-up-tasks?status=pending", None, token)
    _expect(status, 200, "Pending status filter")
    if pending["id"] not in {row["id"] for row in filtered}:
        raise VerificationError("Pending status filter omitted the synthetic pending task")
    checks.append("status filter")

    status, _ = transport("GET", f"/provider/patients/{patient_id}/agent-runs", None, None)
    _expect(status, 401, "Unauthenticated protection")
    checks.append("unauthenticated protection")

    status, updated = transport(
        "PATCH", f"/provider/follow-up-tasks/{pending['id']}", {"status": "in_progress"}, token
    )
    _expect(status, 200, "Allowed task transition")
    if updated.get("status") != "in_progress":
        raise VerificationError("Allowed transition returned an unexpected status")
    checks.append("pending to in_progress")

    status, _ = transport(
        "PATCH", f"/provider/follow-up-tasks/{pending['id']}", {"status": "pending"}, token
    )
    _expect(status, 422, "Invalid task transition protection")
    checks.append("invalid transition protection")
    return VerificationResult(tuple(checks), pending["id"], "in_progress")
