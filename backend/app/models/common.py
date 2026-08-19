"""
Response/request models shared between /patient/* and /provider/* routes,
so both sides describe the same underlying rows the same way.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class MedicationOut(BaseModel):
    id: str
    medication_name: str
    dosage_description: str | None
    scheduled_time: str | None
    supply_status: str


class BPReadingOut(BaseModel):
    id: str
    systolic: int
    diastolic: int
    measured_at: datetime
    recorded_at: datetime


class BPReadingCreateRequest(BaseModel):
    systolic: int = Field(..., ge=40, le=300)
    diastolic: int = Field(..., ge=20, le=200)
    measured_at: datetime | None = Field(
        default=None,
        description="When the reading was actually taken. Defaults to now if omitted.",
    )


class PatientProfileOut(BaseModel):
    id: str
    full_name: str
    age: int | None
    contact_number: str | None
    email: str
