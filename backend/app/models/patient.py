"""
Request/response models specific to /patient/home and /patient/history.
Everything else under /patient/* reuses models/common.py and
models/checkins.py directly.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.checkins import CheckInRecord, RiskAssessmentSummary
from app.models.common import BPReadingOut, MedicationOut


class PatientHomeOut(BaseModel):
    full_name: str
    medications: list[MedicationOut]
    latest_check_in: CheckInRecord | None
    latest_check_in_risk: RiskAssessmentSummary | None
    latest_bp: BPReadingOut | None


class PatientHistoryEntryOut(BaseModel):
    entry_type: Literal["check_in", "bp_reading"]
    occurred_at: datetime
    check_in: CheckInRecord | None = None
    check_in_risk: RiskAssessmentSummary | None = None
    bp_reading: BPReadingOut | None = None
