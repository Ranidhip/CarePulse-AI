"""
Response/request models shared between /patient/* and /provider/* routes,
so both sides describe the same underlying rows the same way.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Matches the `supply_status` Postgres enum exactly (init_schema migration,
# line 16): 'adequate' | 'low' | 'out'.
SupplyStatus = Literal["adequate", "low", "out"]


class MedicationOut(BaseModel):
    id: str
    medication_name: str
    dosage_description: str | None
    scheduled_time: str | None
    supply_status: str
    reminder_enabled: bool = True


class MedicationCreateRequest(BaseModel):
    medication_name: str = Field(..., min_length=1, max_length=200)
    dosage_description: str | None = Field(default=None, max_length=500)
    scheduled_time: str | None = Field(default=None, max_length=100)
    supply_status: SupplyStatus = "adequate"
    reminder_enabled: bool = True


class MedicationUpdateRequest(BaseModel):
    """All fields optional — only the ones provided are changed."""

    medication_name: str | None = Field(default=None, min_length=1, max_length=200)
    dosage_description: str | None = Field(default=None, max_length=500)
    scheduled_time: str | None = Field(default=None, max_length=100)
    supply_status: SupplyStatus | None = None
    reminder_enabled: bool | None = None


class BPReadingOut(BaseModel):
    id: str
    systolic: int
    diastolic: int
    pulse: int | None = None
    notes: str | None = None
    measured_at: datetime
    recorded_at: datetime


class BPReadingCreateRequest(BaseModel):
    systolic: int = Field(..., ge=40, le=300)
    diastolic: int = Field(..., ge=20, le=200)
    pulse: int | None = Field(default=None, ge=20, le=250)
    notes: str | None = Field(default=None, max_length=500)
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
