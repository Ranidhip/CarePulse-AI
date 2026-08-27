"""
Request/response models for the weekly check-in endpoints.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class CheckInCreateRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=1, max_length=100)
    missed_doses: bool
    missed_dose_count: int | None = Field(default=None, ge=0)
    medication_stopped: bool
    supply_remaining: bool
    systolic: int | None = Field(default=None, ge=40, le=300)
    diastolic: int | None = Field(default=None, ge=20, le=200)
    difficulty_reported: bool = False
    difficulty_text: str | None = Field(default=None, max_length=500)
    requests_contact: bool = False
    patient_submitted_at: datetime


class RiskAssessmentSummary(BaseModel):
    rule_result_level: str
    final_level: str
    ai_status: str
    # Deliberate policy reversal (2026-08-22): the AI-generated summary is
    # now shown to the patient too, not just providers — the patient app's
    # Check-in Submitted / History screens surface it as an "Alert state"
    # message when final_level is medium/high. Reason codes and evidence
    # text remain provider-only; only this rendered summary crosses over.
    # See CheckInRecord's docstring below, which previously said the
    # opposite and has been corrected to match.
    provider_summary: str | None = None


class CheckInCreateResponse(BaseModel):
    check_in_id: str
    risk_assessment: RiskAssessmentSummary
    message: str


class CheckInRecord(BaseModel):
    """
    The patient's own check-in as stored — used by GET /patient/check-ins
    and GET /patient/check-ins/latest. Does NOT include reason codes or
    evidence text — those stay provider-facing only. The AI-generated
    provider_summary, previously withheld here too, is now surfaced
    separately via RiskAssessmentSummary.provider_summary (see that
    model's docstring) — a deliberate 2026-08-22 policy change, not an
    oversight.
    """

    id: str
    missed_doses: bool
    missed_dose_count: int | None
    medication_stopped: bool
    supply_remaining: bool
    difficulty_reported: bool
    difficulty_text: str | None
    requests_contact: bool
    patient_submitted_at: datetime
    server_received_at: datetime


class CheckInLatestResponse(BaseModel):
    check_in: CheckInRecord
    risk_assessment: RiskAssessmentSummary
