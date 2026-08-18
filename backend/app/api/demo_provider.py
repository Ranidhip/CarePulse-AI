"""
Demo-mode provider routes. Mounted at /demo/provider/* only when
settings.demo_mode is True (see main.py). Reuses the same SQLite demo
repository and the same seeded patients the mobile app writes to — there
is exactly one demo dataset, read by both clients.

No risk is computed here. Every risk_level and reason_codes value shown
to the provider is read straight from what app.services.rules.engine
already calculated at check-in time (in demo_patient.py or seed.py) —
this router only reads and formats, never recalculates.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.demo import repository, seed
from app.demo.auth import get_demo_current_provider

router = APIRouter(prefix="/demo/provider", tags=["demo-provider"])

RISK_SORT_ORDER = {"high": 0, "medium": 1, "pending": 2, "low": 3}

ALERT_STATUSES = ("New", "In Progress", "Follow-up Recorded", "Resolved")
CONTACT_METHODS = ("Phone", "Message", "Clinic Visit", "Unable to Reach", "Other")


# --- Auth ---------------------------------------------------------------


class DemoProviderSignInRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


@router.post("/auth/sign-in")
def provider_sign_in(body: DemoProviderSignInRequest) -> dict:
    """Demo authentication only — see app/demo/auth.py."""
    seed.ensure_seeded()
    provider = repository.find_provider_by_email(body.email) or repository.get_provider(
        seed.DEMO_PROVIDER_ID
    )
    if provider is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Demo provider not seeded")
    return {
        "access_token": provider["id"],
        "provider": {
            "id": provider["id"],
            "name": provider["name"],
            "email": provider["email"],
            "clinic": provider["clinic"],
        },
    }


# --- Shared formatting ---------------------------------------------------


def _effective_risk(summary: dict) -> str:
    """'pending' when a patient has never checked in — not a rule-engine output,
    purely a display state for patients with no data yet."""
    if summary["latestCheckIn"] is None:
        return "pending"
    return summary["latestCheckIn"]["risk_level"]


def _main_reason(summary: dict) -> str:
    checkin = summary["latestCheckIn"]
    if checkin is None:
        return "Check-in incomplete"
    codes = checkin["reason_codes"]
    if not codes:
        return "No priority reason"
    labels = {
        "MEDICATION_STOPPED": "medication stopped",
        "ABNORMAL_BP": "elevated BP",
        "MISSED_DOSES": f"{checkin['missed_dose_count'] or 0} missed doses",
        "LOW_SUPPLY": "medicine supply low",
        "SCHEDULE_DIFFICULTY": "treatment difficulty",
    }
    return ", ".join(labels.get(c, c) for c in codes)


def _queue_row(summary: dict) -> dict:
    patient = summary["patient"]
    checkin = summary["latestCheckIn"]
    bp = summary["latestBP"]
    follow_up = summary["latestFollowUp"]
    return {
        "id": patient["id"],
        "name": patient["name"],
        "age": patient["age"],
        "latestBP": f"{bp['systolic']}/{bp['diastolic']}" if bp else None,
        "missedDoses": checkin["missed_dose_count"] if checkin else None,
        "supplyBucket": checkin["supply_bucket"] if checkin else None,
        "riskLevel": _effective_risk(summary),
        "mainReason": _main_reason(summary),
        "lastCheckInDate": checkin["patient_submitted_at"] if checkin else None,
        "alertStatus": follow_up["alert_status"] if follow_up else "New",
    }


# --- Dashboard ---------------------------------------------------


@router.get("/dashboard/summary")
def dashboard_summary(provider: dict = Depends(get_demo_current_provider)) -> dict:
    summaries = repository.list_patient_summaries()
    risks = [_effective_risk(s) for s in summaries]
    return {
        "totalPatients": len(summaries),
        "highRisk": risks.count("high"),
        "mediumRisk": risks.count("medium"),
        "pendingReview": risks.count("pending"),
        "checkInsReceived": sum(1 for s in summaries if s["latestCheckIn"] is not None),
        "recentAlerts": sorted(
            (
                {
                    "patientId": s["patient"]["id"],
                    "patientName": s["patient"]["name"],
                    "riskLevel": _effective_risk(s),
                    "mainReason": _main_reason(s),
                    "date": s["latestCheckIn"]["patient_submitted_at"],
                }
                for s in summaries
                if s["latestCheckIn"] is not None
            ),
            key=lambda a: a["date"],
            reverse=True,
        )[:5],
    }


@router.get("/patients")
def priority_queue(
    risk: str | None = None, provider: dict = Depends(get_demo_current_provider)
) -> list[dict]:
    summaries = repository.list_patient_summaries()
    rows = [_queue_row(s) for s in summaries]
    if risk and risk != "all":
        rows = [r for r in rows if r["riskLevel"] == risk]
    rows.sort(key=lambda r: RISK_SORT_ORDER.get(r["riskLevel"], 9))
    return rows


@router.get("/patients/{patient_id}")
def patient_detail(patient_id: str, provider: dict = Depends(get_demo_current_provider)) -> dict:
    patient = repository.get_patient(patient_id)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    summary = repository.get_patient_summary(patient_id)
    return {
        "patient": patient,
        "medications": repository.list_medications(patient_id),
        "latestCheckIn": summary["latestCheckIn"],
        "latestBP": summary["latestBP"],
        "riskLevel": _effective_risk(summary),
        "followUps": repository.list_follow_ups(patient_id),
    }


# --- Follow-up ---------------------------------------------------


class FollowUpRequest(BaseModel):
    contact_method: str
    notes: str | None = Field(default=None, max_length=500)
    next_action: str | None = Field(default=None, max_length=300)
    alert_status: str
    next_action_date: str | None = None


@router.post("/patients/{patient_id}/follow-up")
def create_follow_up(
    patient_id: str,
    body: FollowUpRequest,
    provider: dict = Depends(get_demo_current_provider),
) -> dict:
    if repository.get_patient(patient_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    if body.contact_method not in CONTACT_METHODS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid contact_method")
    if body.alert_status not in ALERT_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid alert_status")

    return repository.add_follow_up(
        patient_id=patient_id,
        provider_id=provider["id"],
        contact_method=body.contact_method,
        notes=body.notes,
        next_action=body.next_action,
        alert_status=body.alert_status,
        next_action_date=body.next_action_date,
    )


@router.get("/patients/{patient_id}/follow-ups")
def list_follow_ups(
    patient_id: str, provider: dict = Depends(get_demo_current_provider)
) -> list[dict]:
    if repository.get_patient(patient_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    return repository.list_follow_ups(patient_id)
