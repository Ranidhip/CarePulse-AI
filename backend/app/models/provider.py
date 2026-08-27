"""
Request/response models for /provider/* routes.

Models here cover the provider dashboard, patient detail, alerts,
provider-recorded follow-up actions, and the Phase 5 agent-run / agent-
generated follow-up-task surface. Agent responses intentionally expose
only safe audit metadata: never prompts, model payloads, tool inputs,
tool outputs, or internal exception details.
"""

from datetime import date, datetime, time
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


class ColleagueOut(BaseModel):
    """Another provider, for the "reassign to" dropdown — nothing else about them is exposed."""

    id: str
    full_name: str


class ReassignPatientRequest(BaseModel):
    to_provider_id: str = Field(..., min_length=1)


class DashboardSummaryOut(BaseModel):
    total_patients: int
    high_risk: int
    medium_risk: int
    pending_review: int
    low_risk: int
    check_ins_received: int
    check_ins_this_week: int


class QueueRowOut(BaseModel):
    patient_id: str
    full_name: str
    age: int | None
    tier: RiskTier
    final_level: str | None
    # Set only once a provider has overridden the level (see
    # RiskAssessmentOverrideRequest below) — when present, this is the
    # level actually shown to the provider; final_level above stays the
    # unedited rule/AI result underneath it.
    provider_override_level: str | None = None
    reason_codes: list[str]
    requires_manual_review: bool
    latest_bp: str | None
    last_check_in_at: datetime | None
    alert_status: AlertStatus | None


class RiskReasonOut(BaseModel):
    reason_code: str
    source: str
    evidence_text: str | None


RiskAssessmentFeedback = Literal["helpful", "not_helpful", "reported"]


class RiskAssessmentDetailOut(BaseModel):
    id: str
    rule_result_level: str
    ai_suggested_level: str | None
    ai_confidence: float | None
    final_level: str
    ai_status: str
    requires_manual_review: bool
    provider_summary: str | None
    model_version: str | None
    created_at: datetime
    reasons: list[RiskReasonOut]
    feedback: RiskAssessmentFeedback | None = None
    feedback_at: datetime | None = None
    feedback_note: str | None = None
    provider_override_level: str | None = None
    provider_override_at: datetime | None = None
    provider_override_reason: str | None = None


class RiskAssessmentFeedbackRequest(BaseModel):
    feedback: RiskAssessmentFeedback
    # Only meaningful (and only ever shown by the UI) for "reported" — a
    # one-click Helpful/Not helpful never carries a note.
    feedback_note: str | None = Field(default=None, max_length=1000)


class RiskAssessmentFeedbackOut(BaseModel):
    id: str
    feedback: RiskAssessmentFeedback | None
    feedback_at: datetime | None
    feedback_by: str | None
    feedback_note: str | None


RiskLevel = Literal["low", "medium", "high"]


class RiskAssessmentOverrideRequest(BaseModel):
    level: RiskLevel
    reason: str = Field(..., min_length=1, max_length=1000)


class RiskAssessmentOverrideOut(BaseModel):
    id: str
    provider_override_level: str | None
    provider_override_at: datetime | None
    provider_override_by: str | None
    provider_override_reason: str | None


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
    # The recording provider's own display name — resolved server-side via
    # a provider_profiles lookup (see _attach_provider_names in
    # app/api/provider.py) so the Follow-up History screen can show who
    # took each action without the frontend having to resolve UUIDs
    # itself. None only if the provider row has since been deleted.
    provider_full_name: str | None = None
    action_type: FollowUpActionType
    note_text: str | None
    # Split out from note_text so the Record Follow-up form's "Notes" and
    # "Next advice" fields round-trip as two distinct values instead of
    # being concatenated into one column (see the migration's docstring:
    # supabase/migrations/20260827111500_follow_up_action_fields.sql).
    next_advice: str | None = None
    outcome: FollowUpOutcome | None
    status: FollowUpStatus
    contacted_person: str | None = None
    follow_up_date: date | None = None
    follow_up_time: time | None = None
    assigned_to_provider_id: str | None = None
    # Resolved the same way as provider_full_name above, for whoever the
    # next action is assigned to (may differ from the recording provider).
    assigned_to_provider_name: str | None = None
    notify_patient: bool = False
    next_action_date: date | None = None
    created_at: datetime


class FollowUpActionCreateRequest(BaseModel):
    alert_id: str = Field(..., min_length=1)
    action_type: FollowUpActionType
    note_text: str | None = Field(default=None, max_length=1000)
    next_advice: str | None = Field(default=None, max_length=1000)
    outcome: FollowUpOutcome | None = None
    status: FollowUpStatus = "needs_review"
    # Optional: when set, the alert itself (alerts.status) is updated to
    # this value as part of recording the follow-up — this is what
    # actually closes an alert out. Distinct from `status` above, which
    # only tracks the follow_up_actions row's own review state and never
    # touches the alert. Without this field, "resolving" an alert here
    # was a no-op that left it open forever (see PATCH /provider/alerts).
    alert_status: AlertStatus | None = None
    contacted_person: str | None = Field(default=None, max_length=200)
    follow_up_date: date | None = None
    follow_up_time: time | None = None
    assigned_to_provider_id: str | None = None
    notify_patient: bool = False
    next_action_date: date | None = None


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
    condition: str | None = None
    clinic: str | None = None
    enrolled_at: datetime | None = None


class PatientDetailOut(BaseModel):
    profile: PatientSummaryOut
    medications: list[MedicationOut]
    latest_bp: BPReadingOut | None
    latest_check_in: CheckInWithAssessmentOut | None
    open_alerts: list[AlertOut]
    follow_ups: list[FollowUpActionOut]
    # The provider currently holding the active
    # patient_provider_assignments row for this patient — resolved
    # server-side (see patient_detail() in app/api/provider.py). None only
    # in the edge case of a patient with no active assignment, which
    # shouldn't normally reach this endpoint since require_assigned_patient
    # already requires the caller to be that assignment.
    assigned_provider_name: str | None = None


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
