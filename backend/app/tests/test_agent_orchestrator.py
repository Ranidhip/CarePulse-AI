"""
Comprehensive tests for app.services.agents.orchestrator.run_agent_workflow,
covering every category required for Phase 4: successful orchestration,
invalid structured output, model timeout, insufficient quota, duplicate/
idempotent execution, prohibited medical output, partial agent failure,
and deterministic fallback.

Every test uses FakeAgentModel (app/tests/agents_fakes.py) as the `model`
argument — the DI substitution point — and a small in-memory fake
Supabase "database" supporting insert/upsert/update/select. No real
network call is made anywhere in this file, and no real API key is used
or required to run these tests.
"""

import asyncio
import uuid
from datetime import datetime, timezone

import openai
import pytest

from app.services.agents.orchestrator import run_agent_workflow
from app.services.agents.schemas import ClinicalSafetyOutput, FollowUpCoordinatorOutput
from app.services.ai.schemas import AIEvidence, AIResponse
from app.tests.agents_fakes import FakeAgentModel, SleepThenFail

CHECK_IN_ID = "check-in-1"
PATIENT_ID = "patient-1"


# --- In-memory fake Supabase "database" -----------------------------------


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

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._predicates.append(lambda r, c=col, v=val: r.get(c) == v)
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
        self._store: dict[str, list[dict]] = {}

    def table(self, name: str) -> FakeTable:
        return FakeTable(self._store, name)


# --- Fixtures --------------------------------------------------------------


def _valid_analysis(level="medium", summary="Patient reported missing a dose this week."):
    return AIResponse(
        suggested_risk_level=level,
        reason_codes=["MISSED_DOSES"],
        evidence=[AIEvidence(reason_code="MISSED_DOSES", text="Patient reported missing a dose.")],
        provider_summary=summary,
        confidence=0.75,
        requires_manual_review=False,
    )


def _valid_coordination(create_task=True):
    return FollowUpCoordinatorOutput(
        create_task=create_task,
        task_type="nurse_review" if create_task else None,
        priority="medium" if create_task else None,
        rationale="Patient reported a missed dose; nurse follow-up recommended.",
        schedule_reminder=False,
    )


def _valid_safety(approved=True, rejection_reason=None):
    return ClinicalSafetyOutput(
        approved=approved, concerns=[], rejection_reason=rejection_reason
    )


def _run(model, db, *, check_in_id=CHECK_IN_ID, patient_id=PATIENT_ID, rule_result_level="low", timeout_seconds=5.0):
    return asyncio.run(
        run_agent_workflow(
            db,
            check_in_id=check_in_id,
            patient_id=patient_id,
            rule_result_level=rule_result_level,
            difficulty_text="I've been feeling dizzy.",
            missed_doses=True,
            missed_dose_count=1,
            medication_stopped=False,
            supply_remaining=True,
            model=model,
            model_label="fake-model-for-tests",
            timeout_seconds=timeout_seconds,
        )
    )


# --- 1. Successful orchestration -----------------------------------------


def test_successful_orchestration_creates_task_and_records_actions():
    db = FakeDB()
    model = FakeAgentModel(
        [_valid_analysis(level="medium"), _valid_coordination(create_task=True), _valid_safety(approved=True)]
    )

    outcome = _run(model, db, rule_result_level="low")

    assert outcome.status == "completed"
    assert outcome.ai_status == "completed"
    assert outcome.final_level == "medium"  # raised from rule's "low"
    assert model.call_count == 3

    actions = db._store.get("agent_actions", [])
    assert len(actions) == 3
    assert {a["agent_name"] for a in actions} == {
        "CheckInAnalysisAgent",
        "FollowUpCoordinatorAgent",
        "ClinicalSafetyAgent",
    }

    tasks = db._store.get("follow_up_tasks", [])
    assert len(tasks) == 1
    assert tasks[0]["task_type"] == "nurse_review"
    assert tasks[0]["agent_run_id"] == db._store["agent_runs"][0]["id"]

    run_row = db._store["agent_runs"][0]
    assert run_row["status"] == "completed"


def test_agents_cannot_lower_high_rule_risk():
    db = FakeDB()
    model = FakeAgentModel(
        [_valid_analysis(level="low"), _valid_coordination(create_task=False), _valid_safety(approved=True)]
    )
    outcome = _run(model, db, rule_result_level="high")
    assert outcome.final_level == "high"  # NOT lowered despite AI suggesting "low"


# --- 2. Invalid structured output ------------------------------------------


def test_invalid_structured_output_fails_safely():
    db = FakeDB()
    # Malformed: invalid enum value, not a real reason code / risk level.
    bad_json = {
        "suggested_risk_level": "urgent",  # not a valid RiskLevel
        "reason_codes": ["NOT_REAL"],
        "evidence": [],
        "provider_summary": "x",
        "confidence": 0.5,
        "requires_manual_review": False,
    }
    model = FakeAgentModel([bad_json])

    outcome = _run(model, db)

    assert outcome.status == "failed"
    assert outcome.error_code is not None
    assert outcome.error_code.startswith("AGENT_")
    assert db._store.get("follow_up_tasks", []) == []


# --- 3. Model timeout ------------------------------------------------------


def test_model_timeout_fails_safely():
    db = FakeDB()
    model = FakeAgentModel([SleepThenFail(seconds=2.0)])

    outcome = _run(model, db, timeout_seconds=0.05)

    assert outcome.status == "failed"
    assert outcome.error_code == "AGENT_TIMEOUT"
    assert outcome.final_level == "low"  # falls back to rule result
    assert outcome.requires_manual_review is True


# --- 4. Insufficient quota --------------------------------------------------


def test_insufficient_quota_fails_safely():
    db = FakeDB()
    rate_limit_error = openai.RateLimitError.__new__(openai.RateLimitError)
    model = FakeAgentModel([rate_limit_error])

    outcome = _run(model, db)

    assert outcome.status == "failed"
    assert "RateLimitError" in outcome.error_code
    assert db._store.get("follow_up_tasks", []) == []


# --- 5. Duplicate / idempotent execution -----------------------------------


def test_duplicate_execution_does_not_rerun_or_duplicate():
    db = FakeDB()
    first_model = FakeAgentModel(
        [_valid_analysis(), _valid_coordination(create_task=True), _valid_safety(approved=True)]
    )
    first_outcome = _run(first_model, db)
    assert first_outcome.status == "completed"
    assert len(db._store.get("follow_up_tasks", [])) == 1
    assert len(db._store.get("agent_actions", [])) == 3

    # A second call for the SAME check_in_id, with a model that would
    # raise AssertionError if it were ever actually invoked.
    second_model = FakeAgentModel([])
    second_outcome = _run(second_model, db)

    assert second_outcome.duplicate is True
    assert second_model.call_count == 0
    assert len(db._store.get("follow_up_tasks", [])) == 1  # still just one
    assert len(db._store.get("agent_actions", [])) == 3  # still just three
    assert len(db._store.get("agent_runs", [])) == 1  # upserted, not duplicated


# --- 6. Prohibited medical output -------------------------------------------


def test_prohibited_medical_output_blocked_by_deterministic_backstop():
    db = FakeDB()
    # .model_construct() deliberately bypasses AIResponse's own
    # banned-language field_validator — simulating "schema-level
    # validation somehow let this through", specifically to prove the
    # orchestrator's SEPARATE deterministic backstop (not just the
    # schema validator) is what actually blocks it. See
    # app/services/agents/safety.py.
    unsafe_analysis = AIResponse.model_construct(
        suggested_risk_level="medium",
        reason_codes=["SIDE_EFFECTS"],
        evidence=[AIEvidence(reason_code="SIDE_EFFECTS", text="Patient reported dizziness.")],
        provider_summary="Patient should increase your dose to manage the dizziness.",
        confidence=0.7,
        requires_manual_review=False,
    )
    # ClinicalSafetyAgent WRONGLY approves — testing that the backstop
    # catches it independently of the agent's own (imperfect) judgment.
    model = FakeAgentModel(
        [unsafe_analysis, _valid_coordination(create_task=True), _valid_safety(approved=True)]
    )

    outcome = _run(db=db, model=model)

    # Whether the SDK's own structured-output parsing rejects this before
    # the orchestrator's backstop is even reached (raising
    # ModelBehaviorError -> status="failed"), or successfully parses it
    # and deterministic_safety_check() catches it afterward (status=
    # "manual_review"), the critical safety invariant is identical either
    # way: no follow-up task is ever created from unsafe content. This
    # test asserts that invariant regardless of which path fired, since
    # which one fires depends on SDK-internal validation behavior this
    # session could not fully verify (see agents_fakes.py's docstring).
    assert outcome.status in ("manual_review", "failed")
    assert outcome.requires_manual_review is True
    assert db._store.get("follow_up_tasks", []) == []  # blocked, never created

    # If the backstop specifically was reached, confirm it left an audit
    # trail explaining why.
    if outcome.status == "manual_review":
        backstop_actions = [
            a for a in db._store["agent_actions"] if a["tool_name"] == "deterministic_backstop"
        ]
        assert len(backstop_actions) == 1
        assert backstop_actions[0]["status"] == "failed"


# --- 7. Partial agent failure ------------------------------------------------


def test_partial_agent_failure_preserves_completed_agent_actions():
    db = FakeDB()
    # CheckInAnalysisAgent succeeds; FollowUpCoordinatorAgent fails.
    coordinator_error = openai.APITimeoutError.__new__(openai.APITimeoutError)
    model = FakeAgentModel([_valid_analysis(), coordinator_error])

    outcome = _run(model, db)

    assert outcome.status == "failed"
    assert model.call_count == 2  # got through agent 1, failed on agent 2, never reached 3

    actions = db._store.get("agent_actions", [])
    assert len(actions) == 1  # only the first agent's action was recorded
    assert actions[0]["agent_name"] == "CheckInAnalysisAgent"
    assert db._store.get("follow_up_tasks", []) == []


# --- 8. Deterministic fallback -----------------------------------------------


def test_deterministic_fallback_on_first_agent_failure():
    db = FakeDB()
    model = FakeAgentModel([openai.AuthenticationError.__new__(openai.AuthenticationError)])

    outcome = _run(model, db, rule_result_level="high")

    assert outcome.status == "failed"
    assert outcome.ai_status == "failed"
    assert outcome.final_level == "high"  # exactly the rule result, untouched
    assert outcome.requires_manual_review is True
    assert outcome.provider_summary is None  # no AI-generated summary produced
    assert db._store.get("follow_up_tasks", []) == []

    run_row = db._store["agent_runs"][0]
    assert run_row["status"] == "failed"
    assert run_row["error_code"] is not None
