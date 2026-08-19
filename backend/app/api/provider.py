"""
Production provider routes.

Every route that targets a specific patient uses
Depends(require_assigned_patient), which enforces both the provider role
and an active patient_provider_assignments row, returning 404 (never 403)
when the caller isn't assigned — see app/api/deps.py.

Scope note: this file does not implement GET /provider/patients/{id}/
agent-runs, GET /provider/follow-up-tasks, or PATCH
/provider/follow-up-tasks/{task_id}. Those read from agent_runs /
agent_actions / follow_up_tasks, which the three-agent workflow (Phase 4)
hasn't written to yet — implementing them now would be an endpoint that
always returns empty data, not working functionality. They're built in
Phase 5 ("provider display of AI evidence and agent actions") alongside
the workflow that actually populates those tables.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.api.deps import AssignedProviderContext, require_assigned_patient, require_provider
from app.core.security import CurrentUser, get_supabase_client
from app.models.checkins import CheckInRecord
from app.models.common import BPReadingOut, MedicationOut
from app.models.provider import (
    AlertOut,
    AlertPatchRequest,
    CheckInWithAssessmentOut,
    DashboardSummaryOut,
    FollowUpActionCreateRequest,
    FollowUpActionOut,
    PatientDetailOut,
    PatientSummaryOut,
    QueueRowOut,
    RiskAssessmentDetailOut,
    RiskReasonOut,
    TimelineEntryOut,
)
from app.services.providers import (
    get_alert_or_404,
    get_patient_or_404,
    get_provider_profile_id,
    has_active_assignment,
)

router = APIRouter()

# Tier ordering for the priority queue, per the confirmed spec:
# High, Medium, Pending/manual review, Low.
TIER_SORT_ORDER = {"high": 0, "medium": 1, "pending": 2, "low": 3}

# A UUID that cannot exist as a real row id — used with .in_() when the
# "real" id list is empty, so the query is still valid SQL that simply
# matches nothing, instead of special-casing an empty .in_() call.
_NO_MATCH_SENTINEL = "00000000-0000-0000-0000-000000000000"


# --- Shared data assembly -------------------------------------------------


def _latest_check_in_row(supabase: Client, patient_id: str) -> dict | None:
    result = (
        supabase.table("weekly_check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("server_received_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _latest_assessment_row(supabase: Client, check_in_id: str) -> dict | None:
    result = (
        supabase.table("risk_assessments")
        .select("*")
        .eq("check_in_id", check_in_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _reasons_for_assessment(supabase: Client, assessment_id: str) -> list[RiskReasonOut]:
    result = (
        supabase.table("risk_reasons")
        .select("reason_code, source, evidence_text")
        .eq("risk_assessment_id", assessment_id)
        .execute()
    )
    return [RiskReasonOut(**r) for r in result.data]


def _earliest_unresolved_alert(supabase: Client, patient_id: str) -> dict | None:
    result = (
        supabase.table("alerts")
        .select("*")
        .eq("patient_id", patient_id)
        .neq("status", "resolved")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _compute_tier(assessment_row: dict | None) -> str:
    """
    Bucketing rule (see PHASE2_FILES.txt for the full rationale): a
    confirmed high/medium final_level always wins its tier — manual
    review never demotes a high or medium case into the review bucket.
    "pending" covers both "no check-in yet" and "low risk but flagged for
    manual review", so a flagged-but-otherwise-low case doesn't get lost
    below every other patient.
    """
    if assessment_row is None:
        return "pending"
    level = assessment_row["final_level"]
    if level in ("high", "medium"):
        return level
    if assessment_row["requires_manual_review"]:
        return "pending"
    return "low"


# --- Dashboard -------------------------------------------------------------


@router.get("/provider/dashboard/summary", response_model=DashboardSummaryOut)
def dashboard_summary(
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    provider_id = get_provider_profile_id(supabase, user.id)
    assignments = (
        supabase.table("patient_provider_assignments")
        .select("patient_id")
        .eq("provider_id", provider_id)
        .eq("is_active", True)
        .execute()
    )
    patient_ids = [a["patient_id"] for a in assignments.data]

    tiers: list[str] = []
    check_ins_received = 0
    for patient_id in patient_ids:
        check_in_row = _latest_check_in_row(supabase, patient_id)
        assessment_row = (
            _latest_assessment_row(supabase, check_in_row["id"]) if check_in_row else None
        )
        if check_in_row is not None:
            check_ins_received += 1
        tiers.append(_compute_tier(assessment_row))

    return DashboardSummaryOut(
        total_patients=len(patient_ids),
        high_risk=tiers.count("high"),
        medium_risk=tiers.count("medium"),
        pending_review=tiers.count("pending"),
        low_risk=tiers.count("low"),
        check_ins_received=check_ins_received,
    )


# --- Priority queue ----------------------------------------------------


@router.get("/provider/patients", response_model=list[QueueRowOut])
def priority_queue(
    risk: str | None = None,
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    provider_id = get_provider_profile_id(supabase, user.id)
    assignments = (
        supabase.table("patient_provider_assignments")
        .select("patient_id")
        .eq("provider_id", provider_id)
        .eq("is_active", True)
        .execute()
    )
    patient_ids = [a["patient_id"] for a in assignments.data]

    rows: list[tuple[QueueRowOut, str]] = []  # (row, sort_key_for_alert_time)
    for patient_id in patient_ids:
        patient_row = get_patient_or_404(supabase, patient_id)
        check_in_row = _latest_check_in_row(supabase, patient_id)
        assessment_row = (
            _latest_assessment_row(supabase, check_in_row["id"]) if check_in_row else None
        )
        alert_row = _earliest_unresolved_alert(supabase, patient_id)
        bp_result = (
            supabase.table("blood_pressure_readings")
            .select("systolic, diastolic")
            .eq("patient_id", patient_id)
            .order("measured_at", desc=True)
            .limit(1)
            .execute()
        )
        bp_row = bp_result.data[0] if bp_result.data else None

        tier = _compute_tier(assessment_row)
        reasons: list[str] = []
        if assessment_row is not None:
            reasons_result = (
                supabase.table("risk_reasons")
                .select("reason_code")
                .eq("risk_assessment_id", assessment_row["id"])
                .execute()
            )
            reasons = [r["reason_code"] for r in reasons_result.data]

        row_model = QueueRowOut(
            patient_id=patient_row["id"],
            full_name=patient_row["full_name"],
            age=patient_row["age"],
            tier=tier,
            final_level=assessment_row["final_level"] if assessment_row else None,
            reason_codes=reasons,
            requires_manual_review=(
                assessment_row["requires_manual_review"] if assessment_row else False
            ),
            latest_bp=f"{bp_row['systolic']}/{bp_row['diastolic']}" if bp_row else None,
            last_check_in_at=check_in_row["server_received_at"] if check_in_row else None,
            alert_status=alert_row["status"] if alert_row else None,
        )
        # Patients with an actual unresolved alert sort before those
        # without one, within the same tier ("oldest unresolved first").
        alert_sort_key = alert_row["created_at"] if alert_row else "9999"
        rows.append((row_model, alert_sort_key))

    if risk and risk != "all":
        rows = [r for r in rows if r[0].tier == risk]

    rows.sort(key=lambda pair: (TIER_SORT_ORDER.get(pair[0].tier, 9), pair[1]))
    return [r[0] for r in rows]


# --- Patient detail ----------------------------------------------------


@router.get("/provider/patients/{patient_id}", response_model=PatientDetailOut)
def patient_detail(
    patient_id: str,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    patient_row = get_patient_or_404(supabase, patient_id)

    medications_result = (
        supabase.table("medication_schedules")
        .select("id, medication_name, dosage_description, scheduled_time, supply_status")
        .eq("patient_id", patient_id)
        .execute()
    )
    bp_result = (
        supabase.table("blood_pressure_readings")
        .select("id, systolic, diastolic, measured_at, recorded_at")
        .eq("patient_id", patient_id)
        .order("measured_at", desc=True)
        .limit(1)
        .execute()
    )
    latest_bp = BPReadingOut(**bp_result.data[0]) if bp_result.data else None

    check_in_row = _latest_check_in_row(supabase, patient_id)
    latest_check_in = None
    if check_in_row is not None:
        assessment_row = _latest_assessment_row(supabase, check_in_row["id"])
        assessment_detail = None
        if assessment_row is not None:
            assessment_detail = RiskAssessmentDetailOut(
                **{k: assessment_row[k] for k in (
                    "id", "rule_result_level", "final_level", "ai_status",
                    "requires_manual_review", "provider_summary", "model_version", "created_at",
                )},
                reasons=_reasons_for_assessment(supabase, assessment_row["id"]),
            )
        latest_check_in = CheckInWithAssessmentOut(
            check_in=CheckInRecord(**check_in_row), assessment=assessment_detail
        )

    alerts_result = (
        supabase.table("alerts")
        .select("*")
        .eq("patient_id", patient_id)
        .neq("status", "resolved")
        .order("created_at", desc=True)
        .execute()
    )
    all_alert_ids_result = (
        supabase.table("alerts").select("id").eq("patient_id", patient_id).execute()
    )
    all_alert_ids = [a["id"] for a in all_alert_ids_result.data] or [_NO_MATCH_SENTINEL]
    follow_ups_result = (
        supabase.table("follow_up_actions")
        .select("*")
        .in_("alert_id", all_alert_ids)
        .order("created_at", desc=True)
        .execute()
    )

    return PatientDetailOut(
        profile=PatientSummaryOut(**patient_row),
        medications=[MedicationOut(**m) for m in medications_result.data],
        latest_bp=latest_bp,
        latest_check_in=latest_check_in,
        open_alerts=[AlertOut(**a) for a in alerts_result.data],
        follow_ups=[FollowUpActionOut(**f) for f in follow_ups_result.data],
    )


# --- Timeline ------------------------------------------------------------


@router.get("/provider/patients/{patient_id}/timeline", response_model=list[TimelineEntryOut])
def patient_timeline(
    patient_id: str,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    entries: list[TimelineEntryOut] = []

    check_ins_result = (
        supabase.table("weekly_check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("server_received_at", desc=True)
        .execute()
    )
    for row in check_ins_result.data:
        entries.append(
            TimelineEntryOut(
                entry_type="check_in",
                occurred_at=row["server_received_at"],
                summary="Patient submitted a weekly check-in.",
                data=row,
            )
        )

    alerts_result = (
        supabase.table("alerts")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
    )
    for row in alerts_result.data:
        entries.append(
            TimelineEntryOut(
                entry_type="alert",
                occurred_at=row["created_at"],
                summary=f"Alert {row['status']}.",
                data=row,
            )
        )

    alert_ids = [a["id"] for a in alerts_result.data] or [_NO_MATCH_SENTINEL]
    follow_ups_result = (
        supabase.table("follow_up_actions")
        .select("*")
        .in_("alert_id", alert_ids)
        .order("created_at", desc=True)
        .execute()
    )
    for row in follow_ups_result.data:
        entries.append(
            TimelineEntryOut(
                entry_type="follow_up",
                occurred_at=row["created_at"],
                summary=f"Provider recorded a follow-up ({row['action_type']}).",
                data=row,
            )
        )

    entries.sort(key=lambda e: e.occurred_at, reverse=True)
    return entries


# --- Follow-up actions -----------------------------------------------------


@router.get(
    "/provider/patients/{patient_id}/follow-ups", response_model=list[FollowUpActionOut]
)
def list_follow_ups(
    patient_id: str,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    alert_ids_result = (
        supabase.table("alerts").select("id").eq("patient_id", patient_id).execute()
    )
    alert_ids = [a["id"] for a in alert_ids_result.data] or [_NO_MATCH_SENTINEL]
    result = (
        supabase.table("follow_up_actions")
        .select("*")
        .in_("alert_id", alert_ids)
        .order("created_at", desc=True)
        .execute()
    )
    return [FollowUpActionOut(**f) for f in result.data]


@router.post(
    "/provider/patients/{patient_id}/follow-ups",
    response_model=FollowUpActionOut,
    status_code=201,
)
def create_follow_up(
    patient_id: str,
    body: FollowUpActionCreateRequest,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    # Confirm the alert actually belongs to this patient before attaching
    # a follow-up to it — prevents a provider from (even accidentally)
    # recording a follow-up against a patient they're not viewing.
    alert = get_alert_or_404(supabase, body.alert_id)
    if alert["patient_id"] != patient_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert does not belong to this patient",
        )

    result = (
        supabase.table("follow_up_actions")
        .insert(
            {
                "alert_id": body.alert_id,
                "provider_id": assignment.provider_profile_id,
                "action_type": body.action_type,
                "note_text": body.note_text,
                "outcome": body.outcome,
                "status": body.status,
            }
        )
        .execute()
    )
    return FollowUpActionOut(**result.data[0])


# --- Alerts ----------------------------------------------------------------


@router.patch("/provider/alerts/{alert_id}", response_model=AlertOut)
def update_alert(
    alert_id: str,
    body: AlertPatchRequest,
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    provider_id = get_provider_profile_id(supabase, user.id)
    alert = get_alert_or_404(supabase, alert_id)
    if not has_active_assignment(supabase, provider_id, alert["patient_id"]):
        # Same 404-not-403 rule as require_assigned_patient: this alert
        # exists, but this provider isn't assigned to its patient, so it
        # must look identical to "alert not found".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    update_fields: dict = {"status": body.status}
    if body.status == "acknowledged":
        update_fields["acknowledged_at"] = datetime.now(timezone.utc).isoformat()
        update_fields["acknowledged_by"] = provider_id

    result = (
        supabase.table("alerts").update(update_fields).eq("id", alert_id).execute()
    )
    return AlertOut(**result.data[0])
