"""
Request/response models for /provider/* routes.

Note on scope: models here cover dashboard summary, priority queue,
patient detail, timeline, and follow-up actions (all backed by tables
that already exist). They deliberately do NOT cover agent runs or
follow-up tasks (the agent_runs / agent_actions / follow_up_tasks tables
added in the Phase 1 migration) — that surface is real but has nothing to
display until the three-agent workflow (Phase 4) actually writes to it.
Building those response shapes now against empty/nonexistent-until-applied
tables would be a hollow shell, not working functionality; they're
deferred to Phase 5 ("provider display of AI evidence and agent actions"),
per the confirmed priority order.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.checkins import CheckInRecord
from app.models.common import BPReadingOut, MedicationOut

RiskTier = Literal["high", "medium", "pending", "low"]
AlertStatus = Literal["open", "acknowledged", "resolved"]
FollowUpActionType = Literal["note", "phone_call", "reassignment", "status_update"]
FollowUpOutcome = Literal[
    "contacted",
    "unreachable",
    "referred_to_doctor",
    "medication_supply_issue_reported",
    "other",
]
FollowUpStatus = Literal["needs_review", "in_progress", "completed"]


class DashboardSummaryOut(BaseModel):
    total_patients: int
    high_risk: int
    medium_risk: int
    pending_review: int
    low_risk: int
    check_ins_received: int


class QueueRowOut(BaseModel):
    patient_id: str
    full_name: str
    age: int | None
    tier: RiskTier
    final_level: str | None
    reason_codes: list[str]
    requires_manual_review: bool
    latest_bp: str | None
    last_check_in_at: datetime | None
    alert_status: AlertStatus | None


class RiskReasonOut(BaseModel):
    reason_code: str
    source: str
    evidence_text: str | None


class RiskAssessmentDetailOut(BaseModel):
    id: str
    rule_result_level: str
    final_level: str
    ai_status: str
    requires_manual_review: bool
    provider_summary: str | None
    model_version: str | None
    created_at: datetime
    reasons: list[RiskReasonOut]


class CheckInWithAssessmentOut(BaseModel):
    check_in: CheckInRecord
    assessment: RiskAssessmentDetailOut | None


class AlertOut(BaseModel):
    id: str
    patient_id: str
    status: AlertStatus
    risk_assessment_id: str
    created_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by: str | None


class FollowUpActionOut(BaseModel):
    id: str
    alert_id: str
    provider_id: str
    action_type: FollowUpActionType
    note_text: str | None
    outcome: FollowUpOutcome | None
    status: FollowUpStatus
    created_at: datetime


class FollowUpActionCreateRequest(BaseModel):
    alert_id: str = Field(..., min_length=1)
    action_type: FollowUpActionType
    note_text: str | None = Field(default=None, max_length=1000)
    outcome: FollowUpOutcome | None = None
    status: FollowUpStatus = "needs_review"


class AlertPatchRequest(BaseModel):
    status: AlertStatus


class PatientSummaryOut(BaseModel):
    """
    A patient as a provider is allowed to see them — no email (that's
    account-identity data, not clinical/coordination data the provider
    role needs). Distinct from PatientProfileOut in models/common.py,
    which is the patient's own view of their own account.
    """

    id: str
    full_name: str
    age: int | None
    contact_number: str | None


class PatientDetailOut(BaseModel):
    profile: PatientSummaryOut
    medications: list[MedicationOut]
    latest_bp: BPReadingOut | None
    latest_check_in: CheckInWithAssessmentOut | None
    open_alerts: list[AlertOut]
    follow_ups: list[FollowUpActionOut]


class TimelineEntryOut(BaseModel):
    entry_type: Literal["check_in", "alert", "follow_up"]
    occurred_at: datetime
    summary: str
    data: dict
