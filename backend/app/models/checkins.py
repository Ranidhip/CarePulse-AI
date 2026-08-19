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


class CheckInCreateResponse(BaseModel):
    check_in_id: str
    risk_assessment: RiskAssessmentSummary
    message: str


class CheckInRecord(BaseModel):
    """
    The patient's own check-in as stored — used by GET /patient/check-ins
    and GET /patient/check-ins/latest. Deliberately does NOT include
    provider-only fields (reason codes, evidence text, provider_summary):
    those stay provider-facing only, per the "no clinical content on the
    patient confirmation/history screens" safety rule.
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
