"""The verification runner is tested with a fake transport only."""

from app.services.demo_verification import verify_provider_demo
from app.services.demo_workflow import PENDING_RATIONALE


def test_verification_checks_safety_without_exposing_credentials():
    calls = []
    task = {
        "id": "task-1",
        "patient_id": "patient-1",
        "rationale": PENDING_RATIONALE,
        "status": "pending",
    }

    def transport(method, path, body, token):
        calls.append((method, path, body, token))
        if path == "/auth/sign-in":
            return 200, {"access_token": "private-access-token"}
        if path == "/provider/dashboard/summary":
            return 200, {"total_patients": 1}
        if path == "/provider/patients":
            return 200, [
                {"patient_id": "patient-1", "full_name": "Patient (Synthetic Test Account)"}
            ]
        if path == "/provider/patients/patient-1":
            return 200, {"profile": {"full_name": "Patient (Synthetic Test Account)"}}
        if path.endswith("/agent-runs"):
            if token is None:
                return 401, {"detail": "Not authenticated"}
            return 200, [{"id": "run-1", "actions": []}]
        if path == "/provider/follow-up-tasks":
            return 200, [task]
        if path == "/provider/follow-up-tasks?status=pending":
            return 200, [task]
        if path == "/provider/follow-up-tasks/task-1" and body == {"status": "in_progress"}:
            return 200, {**task, "status": "in_progress"}
        if path == "/provider/follow-up-tasks/task-1" and body == {"status": "pending"}:
            return 422, {"detail": "Invalid transition"}
        raise AssertionError((method, path, body, token))

    result = verify_provider_demo(
        transport, provider_email="provider@test", provider_password="private-password"
    )
    rendered = repr(result)
    assert "private-password" not in rendered
    assert "private-access-token" not in rendered
    assert result.resulting_status == "in_progress"
    assert not any("service-role" in repr(call).lower() for call in calls)
