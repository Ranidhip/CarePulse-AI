"""Phase 5 provider agent-run and follow-up-task API tests.

All database access is handled by the in-memory fake below. These tests
make no Supabase or OpenAI network calls and never instantiate an agent.
"""

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user, get_supabase_client
from app.main import app

client = TestClient(app)

PROVIDER_USER_ID = "provider-user-1"
PROVIDER_ID = "provider-1"
OTHER_PROVIDER_ID = "provider-2"
PATIENT_ID = "patient-1"
OTHER_PATIENT_ID = "patient-2"
RUN_ID = "run-1"
TASK_ID = "task-1"
NOW = "2026-08-19T08:00:00+00:00"


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._predicates = []
        self._limit = None
        self._descending = False
        self._order_column = None
        self._update_fields = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self._predicates.append(lambda row, c=column, v=value: row.get(c) == v)
        return self

    def in_(self, column, values):
        self._predicates.append(lambda row, c=column, vs=values: row.get(c) in vs)
        return self

    def is_(self, column, value):
        assert value == "null"
        self._predicates.append(lambda row, c=column: row.get(c) is None)
        return self

    def order(self, column, desc=False, **_kwargs):
        self._order_column = column
        self._descending = desc
        return self

    def limit(self, value):
        self._limit = value
        return self

    def update(self, fields):
        self._update_fields = fields
        return self

    def execute(self):
        matched = [row for row in self._rows if all(p(row) for p in self._predicates)]
        if self._update_fields is not None:
            for row in matched:
                row.update(self._update_fields)
        if self._order_column is not None:
            matched.sort(
                key=lambda row: row.get(self._order_column) or "",
                reverse=self._descending,
            )
        if self._limit is not None:
            matched = matched[: self._limit]
        return FakeResult([deepcopy(row) for row in matched])


class FakeSupabase:
    def __init__(self, tables):
        self.tables = deepcopy(tables)

    def table(self, name):
        return FakeQuery(self.tables.setdefault(name, []))


def _user(role="provider", user_id=PROVIDER_USER_ID):
    return CurrentUser(
        id=user_id,
        email="provider@example.com",
        role=role,
        is_active=True,
    )


def _task(
    *,
    task_id=TASK_ID,
    patient_id=PATIENT_ID,
    provider_id=None,
    task_status="pending",
):
    return {
        "id": task_id,
        "patient_id": patient_id,
        "agent_run_id": RUN_ID,
        "task_type": "nurse_review",
        "priority": "high",
        "rationale": "Review the adherence concern reported in the check-in.",
        "status": task_status,
        "provider_id": provider_id,
        "due_at": None,
        "created_at": NOW,
        "completed_at": NOW if task_status == "completed" else None,
    }


def _tables(*, assigned=True, tasks=None):
    assignments = []
    if assigned:
        assignments.append(
            {
                "id": "assignment-1",
                "provider_id": PROVIDER_ID,
                "patient_id": PATIENT_ID,
                "is_active": True,
            }
        )
    return {
        "provider_profiles": [{"id": PROVIDER_ID, "user_id": PROVIDER_USER_ID}],
        "patient_provider_assignments": assignments,
        "agent_runs": [
            {
                "id": RUN_ID,
                "check_in_id": "check-in-1",
                "patient_id": PATIENT_ID,
                "status": "completed",
                "model": "must-not-be-returned",
                "error_code": "must-not-be-returned",
                "started_at": NOW,
                "completed_at": NOW,
                "created_at": NOW,
            }
        ],
        "agent_actions": [
            {
                "id": "action-1",
                "agent_run_id": RUN_ID,
                "agent_name": "CheckInAnalysisAgent",
                "action_type": "analyze_check_in",
                "tool_input": {"private": "must-not-be-returned"},
                "tool_output": {"raw": "must-not-be-returned"},
                "status": "success",
                "requires_provider_approval": False,
                "created_at": NOW,
            }
        ],
        "follow_up_tasks": tasks if tasks is not None else [_task()],
    }


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _authorize(fake, role="provider"):
    app.dependency_overrides[get_current_user] = lambda: _user(role=role)
    app.dependency_overrides[get_supabase_client] = lambda: fake


def test_agent_runs_requires_authentication():
    response = client.get(f"/provider/patients/{PATIENT_ID}/agent-runs")
    assert response.status_code == 401


def test_patient_role_cannot_read_agent_runs():
    fake = FakeSupabase(_tables())
    _authorize(fake, role="patient")
    response = client.get(f"/provider/patients/{PATIENT_ID}/agent-runs")
    assert response.status_code == 403


def test_unassigned_provider_cannot_read_agent_runs():
    fake = FakeSupabase(_tables(assigned=False))
    _authorize(fake)
    response = client.get(f"/provider/patients/{PATIENT_ID}/agent-runs")
    assert response.status_code == 404


def test_assigned_provider_reads_safe_agent_run_summary():
    fake = FakeSupabase(_tables())
    _authorize(fake)
    response = client.get(f"/provider/patients/{PATIENT_ID}/agent-runs")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["id"] == RUN_ID
    assert body[0]["status"] == "completed"
    assert body[0]["actions"][0]["agent_name"] == "CheckInAnalysisAgent"
    serialized = response.text
    assert "tool_input" not in serialized
    assert "tool_output" not in serialized
    assert "must-not-be-returned" not in serialized
    assert "error_code" not in serialized
    assert "model" not in serialized


def test_provider_lists_unclaimed_and_own_tasks_but_not_another_providers():
    tasks = [
        _task(task_id="unclaimed", provider_id=None),
        _task(task_id="mine", provider_id=PROVIDER_ID),
        _task(task_id="theirs", provider_id=OTHER_PROVIDER_ID),
        _task(task_id="other-patient", patient_id=OTHER_PATIENT_ID),
    ]
    fake = FakeSupabase(_tables(tasks=tasks))
    _authorize(fake)
    response = client.get("/provider/follow-up-tasks")

    assert response.status_code == 200
    assert {row["id"] for row in response.json()} == {"unclaimed", "mine"}


def test_follow_up_task_status_filter_and_validation():
    tasks = [
        _task(task_id="pending", task_status="pending"),
        _task(task_id="active", task_status="in_progress"),
    ]
    fake = FakeSupabase(_tables(tasks=tasks))
    _authorize(fake)

    response = client.get("/provider/follow-up-tasks?status=in_progress")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == ["active"]

    invalid = client.get("/provider/follow-up-tasks?status=unknown")
    assert invalid.status_code == 422


def test_provider_can_claim_pending_task_by_starting_it():
    fake = FakeSupabase(_tables())
    _authorize(fake)
    response = client.patch(
        f"/provider/follow-up-tasks/{TASK_ID}",
        json={"status": "in_progress"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["provider_id"] == PROVIDER_ID
    assert fake.tables["follow_up_tasks"][0]["provider_id"] == PROVIDER_ID


def test_provider_cannot_update_another_providers_task():
    fake = FakeSupabase(_tables(tasks=[_task(provider_id=OTHER_PROVIDER_ID)]))
    _authorize(fake)
    response = client.patch(
        f"/provider/follow-up-tasks/{TASK_ID}",
        json={"status": "in_progress"},
    )
    assert response.status_code == 404


def test_unassigned_provider_cannot_update_task():
    fake = FakeSupabase(_tables(assigned=False))
    _authorize(fake)
    response = client.patch(
        f"/provider/follow-up-tasks/{TASK_ID}",
        json={"status": "in_progress"},
    )
    assert response.status_code == 404


def test_missing_follow_up_task_returns_404():
    fake = FakeSupabase(_tables(tasks=[]))
    _authorize(fake)
    response = client.patch(
        "/provider/follow-up-tasks/missing",
        json={"status": "in_progress"},
    )
    assert response.status_code == 404


def test_invalid_status_transition_returns_422():
    fake = FakeSupabase(_tables(tasks=[_task(provider_id=PROVIDER_ID, task_status="completed")]))
    _authorize(fake)
    response = client.patch(
        f"/provider/follow-up-tasks/{TASK_ID}",
        json={"status": "in_progress"},
    )
    assert response.status_code == 422


def test_invalid_patch_body_returns_422():
    fake = FakeSupabase(_tables())
    _authorize(fake)
    response = client.patch(
        f"/provider/follow-up-tasks/{TASK_ID}",
        json={"status": "not-a-real-status"},
    )
    assert response.status_code == 422
