"""
Request/response models for /provider/* routes.

Models here cover the provider dashboard, patient detail, alerts,
provider-recorded follow-up actions, and the Phase 5 agent-run / agent-
generated follow-up-task surface. Agent responses intentionally expose
only safe audit metadata: never prompts, model payloads, tool inputs,
tool outputs, or internal exception details.
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
AgentRunStatus = Literal["running", "completed", "failed", "manual_review"]
AgentActionStatus = Literal["success", "failed", "skipped"]
AgentName = Literal[
    "CheckInAnalysisAgent",
    "FollowUpCoordinatorAgent",
    "ClinicalSafetyAgent",
]
FollowUpTaskType = Literal[
    "nurse_review",
    "pharmacist_review",
    "doctor_review",
    "reminder",
    "other",
]
FollowUpTaskStatus = Literal["pending", "in_progress", "completed", "dismissed"]
FollowUpTaskPriority = Literal["low", "medium", "high"]


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


class AgentActionSummaryOut(BaseModel):
    """Provider-safe action evidence; raw model/tool payloads are excluded."""

    id: str
    agent_name: AgentName
    action_type: str
    status: AgentActionStatus
    requires_provider_approval: bool
    created_at: datetime


class AgentRunOut(BaseModel):
    id: str
    check_in_id: str
    patient_id: str
    status: AgentRunStatus
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime
    actions: list[AgentActionSummaryOut]


class FollowUpTaskOut(BaseModel):
    id: str
    patient_id: str
    agent_run_id: str
    task_type: FollowUpTaskType
    priority: FollowUpTaskPriority
    rationale: str
    status: FollowUpTaskStatus
    provider_id: str | None
    due_at: datetime | None
    created_at: datetime
    completed_at: datetime | None


class FollowUpTaskPatchRequest(BaseModel):
    status: FollowUpTaskStatus
