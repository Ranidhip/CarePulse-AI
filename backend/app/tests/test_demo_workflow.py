"""Phase 7 synthetic workflow tests; no network or OpenAI calls."""

from copy import deepcopy

import pytest

from app.services.demo_workflow import (
    DEMO_MODEL,
    DEMO_RATIONALES,
    DEMO_TOOL,
    DemoSafetyError,
    load_demo_context,
    reset_demo_workflow,
    seed_demo_workflow,
)


class Result:
    def __init__(self, data):
        self.data = deepcopy(data)


class Query:
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self.predicates = []
        self.order_column = None
        self.desc = False
        self.pending = None
        self.delete_pending = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.predicates.append(lambda row, c=column, v=value: row.get(c) == v)
        return self

    def in_(self, column, values):
        self.predicates.append(lambda row, c=column, v=set(values): row.get(c) in v)
        return self

    def order(self, column, desc=False):
        self.order_column, self.desc = column, desc
        return self

    def limit(self, _value):
        return self

    def insert(self, row):
        created = dict(row)
        created.setdefault("id", f"{self.name}-{len(self.store.setdefault(self.name, [])) + 1}")
        self.store[self.name].append(created)
        self.pending = [created]
        return self

    def delete(self):
        self.delete_pending = True
        return self

    def execute(self):
        if self.pending is not None:
            return Result(self.pending)
        rows = self.store.setdefault(self.name, [])
        matched = [row for row in rows if all(predicate(row) for predicate in self.predicates)]
        if self.delete_pending:
            self.store[self.name] = [row for row in rows if row not in matched]
        if self.order_column:
            matched.sort(key=lambda row: row.get(self.order_column) or "", reverse=self.desc)
        return Result(matched)


class FakeDB:
    def __init__(self, tables):
        self.tables = deepcopy(tables)

    def table(self, name):
        return Query(self.tables, name)


def tables(*, synthetic=True):
    marker = " (Synthetic Test Account)" if synthetic else ""
    return {
        "users": [
            {
                "id": "provider-user",
                "email": "provider@test",
                "role": "provider",
                "is_active": True,
            },
            {"id": "patient-user", "email": "patient@test", "role": "patient", "is_active": True},
        ],
        "provider_profiles": [
            {"id": "provider-1", "user_id": "provider-user", "full_name": f"Provider{marker}"}
        ],
        "patient_profiles": [
            {"id": "patient-1", "user_id": "patient-user", "full_name": f"Patient{marker}"}
        ],
        "patient_provider_assignments": [
            {
                "id": "assignment-1",
                "provider_id": "provider-1",
                "patient_id": "patient-1",
                "is_active": True,
            }
        ],
        "weekly_check_ins": [
            {
                "id": "check-in-1",
                "patient_id": "patient-1",
                "server_received_at": "2026-08-19T08:00:00Z",
            }
        ],
        "agent_runs": [],
        "agent_actions": [],
        "follow_up_tasks": [],
    }


def context(db):
    return load_demo_context(db, provider_email="provider@test", patient_email="patient@test")


def test_seed_refuses_non_synthetic_profiles():
    db = FakeDB(tables(synthetic=False))
    with pytest.raises(DemoSafetyError, match="not an explicitly synthetic"):
        context(db)


def test_seed_is_idempotent_and_creates_expected_sequence():
    db = FakeDB(tables())
    first = seed_demo_workflow(db, context(db))
    second = seed_demo_workflow(db, context(db))

    assert first == second
    assert len(db.tables["agent_runs"]) == 1
    assert db.tables["agent_runs"][0]["model"] == DEMO_MODEL
    assert [row["agent_name"] for row in db.tables["agent_actions"]] == [
        "CheckInAnalysisAgent",
        "FollowUpCoordinatorAgent",
        "ClinicalSafetyAgent",
    ]
    assert db.tables["agent_actions"][-1]["requires_provider_approval"] is True
    assert {row["status"] for row in db.tables["follow_up_tasks"]} == {"pending", "in_progress"}


def test_reset_previews_then_deletes_only_demo_records():
    db = FakeDB(tables())
    seed_demo_workflow(db, context(db))
    db.tables["agent_runs"].append(
        {"id": "real-run", "patient_id": "patient-1", "check_in_id": "other", "model": "real-model"}
    )
    preview = reset_demo_workflow(db, context(db), confirm=False)
    assert preview.deleted is False
    assert len(db.tables["agent_runs"]) == 2

    deleted = reset_demo_workflow(db, context(db), confirm=True)
    assert deleted.deleted is True
    assert db.tables["agent_runs"] == [
        {"id": "real-run", "patient_id": "patient-1", "check_in_id": "other", "model": "real-model"}
    ]
    assert all(row.get("tool_name") != DEMO_TOOL for row in db.tables["agent_actions"])
    assert all(row.get("rationale") not in DEMO_RATIONALES for row in db.tables["follow_up_tasks"])
