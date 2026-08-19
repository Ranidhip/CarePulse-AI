"""
Route-level tests for POST /patient/check-ins with the Phase 4 three-agent
workflow wired in. Supersedes Phase 3's version of this file, which
monkeypatched app.api.checkins.get_openai_client — that function is no
longer called anywhere in checkins.py, since the single-call AI adapter
was replaced by the agent orchestrator. These tests monkeypatch
app.api.checkins.get_agent_model instead, the equivalent DI point for
Phase 4 (see app/services/agents/client.py).

No real network call is made anywhere in this file. The in-memory fake
Supabase "database" now also supports .upsert() (not just .insert()),
since the orchestrator writes to agent_runs via upsert.
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.security import CurrentUser, get_current_user, get_supabase_client
from app.main import app
from app.services.agents.schemas import ClinicalSafetyOutput, FollowUpCoordinatorOutput
from app.services.ai.schemas import AIEvidence, AIResponse
from app.tests.agents_fakes import FakeAgentModel

client = TestClient(app)

PATIENT_USER_ID = "patient-auth-user-1"
PATIENT_PROFILE_ID = "patient-profile-1"


# --- In-memory fake Supabase "database" (insert + upsert + select) -------


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeTable:
    def __init__(self, store: dict[str, list[dict]], name: str):
        self._store = store
        self._name = name
        self._predicates = []
        self._order_col = None
        self._order_desc = False
        self._limit_n = None
        self._pending_result = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, col, val):
        self._predicates.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def neq(self, col, val):
        self._predicates.append(lambda r, c=col, v=val: r.get(c) != v)
        return self

    def order(self, col, desc=False):
        self._order_col = col
        self._order_desc = desc
        return self

    def limit(self, n):
        self._limit_n = n
        return self

    def insert(self, row: dict):
        new_row = dict(row)
        new_row.setdefault("id", str(uuid.uuid4()))
        new_row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        self._store.setdefault(self._name, []).append(new_row)
        self._pending_result = [new_row]
        return self

    def upsert(self, row: dict, on_conflict: str | None = None):
        rows = self._store.setdefault(self._name, [])
        if on_conflict:
            for existing in rows:
                if existing.get(on_conflict) == row.get(on_conflict):
                    existing.update(row)
                    self._pending_result = [existing]
                    return self
        new_row = dict(row)
        new_row.setdefault("id", str(uuid.uuid4()))
        new_row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        rows.append(new_row)
        self._pending_result = [new_row]
        return self

    def update(self, values: dict):
        self._update_values = values
        return self

    def execute(self):
        if self._pending_result is not None:
            return FakeResult(self._pending_result)
        if hasattr(self, "_update_values"):
            rows = self._store.get(self._name, [])
            matches = [r for r in rows if all(p(r) for p in self._predicates)]
            for r in matches:
                r.update(self._update_values)
            return FakeResult(matches)
        rows = self._store.get(self._name, [])
        matches = [r for r in rows if all(p(r) for p in self._predicates)]
        if self._order_col:
            matches = sorted(
                matches, key=lambda r: r.get(self._order_col) or "", reverse=self._order_desc
            )
        if self._limit_n is not None:
            matches = matches[: self._limit_n]
        return FakeResult(matches)


class FakeDB:
    def __init__(self):
        self._store: dict[str, list[dict]] = {
            "patient_profiles": [
                {
                    "id": PATIENT_PROFILE_ID,
                    "user_id": PATIENT_USER_ID,
                    "full_name": "Test Patient",
                    "age": 60,
                    "contact_number": None,
                }
            ]
        }

    def table(self, name: str) -> FakeTable:
        return FakeTable(self._store, name)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _patient_user() -> CurrentUser:
    return CurrentUser(id=PATIENT_USER_ID, email="patient@example.com", role="patient", is_active=True)


def _submit(db: FakeDB, payload: dict) -> dict:
    app.dependency_overrides[get_current_user] = lambda: _patient_user()
    app.dependency_overrides[get_supabase_client] = lambda: db
    response = client.post("/patient/check-ins", json=payload)
    assert response.status_code == 202, response.text
    return response.json()


LOW_RISK_PAYLOAD = {
    "idempotency_key": "",  # filled per-test
    "missed_doses": False,
    "missed_dose_count": None,
    "medication_stopped": False,
    "supply_remaining": True,
    "difficulty_reported": False,
    "difficulty_text": None,
    "requests_contact": False,
    "patient_submitted_at": datetime.now(timezone.utc).isoformat(),
}

HIGH_RISK_PAYLOAD = {
    **LOW_RISK_PAYLOAD,
    "medication_stopped": True,
}


def _valid_analysis(level: str) -> AIResponse:
    return AIResponse(
        suggested_risk_level=level,
        reason_codes=["MISSED_DOSES"],
        evidence=[AIEvidence(reason_code="MISSED_DOSES", text="Patient reported missing doses.")],
        provider_summary="Patient reported missing several doses this week.",
        confidence=0.8,
        requires_manual_review=False,
    )


def _successful_agent_model(level: str) -> FakeAgentModel:
    return FakeAgentModel(
        [
            _valid_analysis(level),
            FollowUpCoordinatorOutput(
                create_task=True,
                task_type="nurse_review",
                priority="medium",
                rationale="Follow-up warranted.",
                schedule_reminder=False,
            ),
            ClinicalSafetyOutput(approved=True, concerns=[], rejection_reason=None),
        ]
    )


# --- AI disabled (default) — unchanged pre-Phase-3 behavior --------------


def test_ai_disabled_check_in_stores_pending_status(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_enabled", False)

    db = FakeDB()
    body = _submit(db, {**LOW_RISK_PAYLOAD, "idempotency_key": "key-ai-disabled"})

    assert body["risk_assessment"]["ai_status"] == "pending"
    assert body["risk_assessment"]["final_level"] == "low"
    assert body["risk_assessment"]["rule_result_level"] == "low"


# --- Risk combination: agents can raise, never lower ----------------------


def test_agents_raise_low_rule_risk_to_medium(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(
        "app.api.checkins.get_agent_model", lambda: _successful_agent_model("medium")
    )

    db = FakeDB()
    body = _submit(db, {**LOW_RISK_PAYLOAD, "idempotency_key": "key-raise-to-medium"})

    assert body["risk_assessment"]["rule_result_level"] == "low"
    assert body["risk_assessment"]["final_level"] == "medium"
    assert body["risk_assessment"]["ai_status"] == "completed"

    alerts = db._store.get("alerts", [])
    assert len(alerts) == 1
    assert alerts[0]["patient_id"] == PATIENT_PROFILE_ID

    tasks = db._store.get("follow_up_tasks", [])
    assert len(tasks) == 1


def test_agents_cannot_lower_high_rule_risk(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr("app.api.checkins.get_agent_model", lambda: _successful_agent_model("low"))

    db = FakeDB()
    body = _submit(db, {**HIGH_RISK_PAYLOAD, "idempotency_key": "key-cannot-lower-high"})

    assert body["risk_assessment"]["rule_result_level"] == "high"
    assert body["risk_assessment"]["final_level"] == "high"  # NOT lowered to "low"
    assert body["risk_assessment"]["ai_status"] == "completed"


# --- Agent-workflow failure: fallback summary, original check-in kept ----


def test_agent_workflow_failure_uses_fallback_and_preserves_original_check_in(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_enabled", True)

    import openai

    failing_model = FakeAgentModel([openai.APITimeoutError.__new__(openai.APITimeoutError)])
    monkeypatch.setattr("app.api.checkins.get_agent_model", lambda: failing_model)

    db = FakeDB()
    body = _submit(db, {**LOW_RISK_PAYLOAD, "idempotency_key": "key-agent-failure"})

    assert body["risk_assessment"]["ai_status"] == "failed"
    assert body["risk_assessment"]["final_level"] == "low"

    check_ins = db._store.get("weekly_check_ins", [])
    assert len(check_ins) == 1
    assert check_ins[0]["idempotency_key"] == "key-agent-failure"
    assert check_ins[0]["medication_stopped"] is False

    assessments = db._store.get("risk_assessments", [])
    assert len(assessments) == 1
    assert assessments[0]["requires_manual_review"] is True
    assert assessments[0]["provider_summary"]
    assert "Provider review may be required" in assessments[0]["provider_summary"]

    assert db._store.get("follow_up_tasks", []) == []


# --- Idempotent retries never re-run the agent workflow -------------------


def test_duplicate_check_in_does_not_rerun_agent_workflow(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_enabled", True)

    call_count = {"n": 0}

    def _counting_model():
        call_count["n"] += 1
        return _successful_agent_model("medium")

    monkeypatch.setattr("app.api.checkins.get_agent_model", _counting_model)

    db = FakeDB()
    payload = {**LOW_RISK_PAYLOAD, "idempotency_key": "key-duplicate"}

    first = _submit(db, payload)
    second = _submit(db, payload)

    assert call_count["n"] == 1  # get_agent_model (and therefore the workflow) ran once
    assert first["check_in_id"] == second["check_in_id"]
    assert len(db._store.get("weekly_check_ins", [])) == 1  # no duplicate row
    assert len(db._store.get("follow_up_tasks", [])) == 1  # no duplicate task
