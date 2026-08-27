"""
Production provider routes.

Every route that targets a specific patient uses
Depends(require_assigned_patient), which enforces both the provider role
and an active patient_provider_assignments row, returning 404 (never 403)
when the caller isn't assigned — see app/api/deps.py.

Phase 5 additionally exposes provider-safe agent-run evidence and agent-
generated follow-up tasks. Raw prompts, tool inputs/outputs, model
payloads, and internal errors never leave these routes.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.api.deps import AssignedProviderContext, require_assigned_patient, require_provider
from app.core.db import one_or_none
from app.core.security import CurrentUser, get_supabase_client
from app.models.checkins import CheckInRecord
from app.models.common import BPReadingOut, MedicationOut
from app.models.provider import (
    AgentActionSummaryOut,
    AgentRunOut,
    AlertOut,
    AlertPatchRequest,
    CheckInWithAssessmentOut,
    DashboardSummaryOut,
    FollowUpActionCreateRequest,
    FollowUpActionOut,
    FollowUpTaskOut,
    FollowUpTaskPatchRequest,
    FollowUpTaskStatus,
    PatientDetailOut,
    PatientSummaryOut,
    ColleagueOut,
    QueueRowOut,
    ReassignPatientRequest,
    RiskAssessmentDetailOut,
    RiskAssessmentFeedbackOut,
    RiskAssessmentFeedbackRequest,
    RiskAssessmentOverrideOut,
    RiskAssessmentOverrideRequest,
    RiskReasonOut,
    TimelineEntryOut,
)
from app.services.providers import (
    get_alert_or_404,
    get_follow_up_task_or_404,
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

# Agent-generated follow-up tasks are intentionally monotonic. A task
# may be claimed, completed, or dismissed, but a terminal task cannot be
# reopened through this API. Repeating the current status is accepted as
# an idempotent retry.
FOLLOW_UP_TASK_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"pending", "in_progress", "dismissed"},
    "in_progress": {"in_progress", "completed", "dismissed"},
    "completed": {"completed"},
    "dismissed": {"dismissed"},
}


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


def _apply_alert_status(supabase: Client, alert_id: str, new_status: str, provider_id: str) -> dict:
    """
    Shared by PATCH /provider/alerts/{id} and the alert_status field on
    POST .../follow-ups (see FollowUpActionCreateRequest.alert_status) —
    the one place that actually changes alerts.status, so both call
    sites resolve/acknowledge an alert the same way.
    """
    update_fields: dict = {"status": new_status}
    if new_status == "acknowledged":
        update_fields["acknowledged_at"] = datetime.now(timezone.utc).isoformat()
        update_fields["acknowledged_by"] = provider_id
    result = supabase.table("alerts").update(update_fields).eq("id", alert_id).execute()
    return result.data[0]


def _get_assessment_with_patient_or_404(supabase: Client, assessment_id: str) -> tuple[dict, str]:
    """
    Loads a risk_assessments row plus the patient_id it belongs to (via
    its check_in), for routes keyed by assessment_id rather than
    patient_id — mirrors get_alert_or_404's "load first, caller checks
    has_active_assignment() separately" split.
    """
    assessment = one_or_none(
        supabase.table("risk_assessments").select("*").eq("id", assessment_id)
    )
    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Risk assessment not found"
        )
    check_in = one_or_none(
        supabase.table("weekly_check_ins")
        .select("patient_id")
        .eq("id", assessment["check_in_id"])
    )
    if check_in is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Risk assessment not found"
        )
    return assessment, check_in["patient_id"]


def _provider_names_by_id(supabase: Client, provider_ids: list[str]) -> dict[str, str]:
    """
    Resolves a batch of provider_profiles.id -> full_name in one query.

    Used to attach provider_full_name / assigned_to_provider_name onto
    follow_up_actions rows and the patient's assigned-provider name,
    without relying on postgrest's embedded-resource select syntax (kept
    consistent with the rest of this file's "separate query, join in
    Python" pattern — see _reasons_for_assessment, list_colleagues).
    """
    ids = [pid for pid in set(provider_ids) if pid]
    if not ids:
        return {}
    result = (
        supabase.table("provider_profiles")
        .select("id, full_name")
        .in_("id", ids)
        .execute()
    )
    return {row["id"]: row["full_name"] for row in result.data if row.get("full_name")}


def _attach_provider_names(supabase: Client, follow_up_rows: list[dict]) -> list[dict]:
    """
    Returns copies of follow_up_actions rows with provider_full_name and
    assigned_to_provider_name filled in, for FollowUpActionOut. Mutates
    copies, not the originals — callers may reuse the same rows elsewhere
    (e.g. patient_timeline() also builds TimelineEntryOut.data from them).
    """
    ids = [row.get("provider_id") for row in follow_up_rows] + [
        row.get("assigned_to_provider_id") for row in follow_up_rows
    ]
    names = _provider_names_by_id(supabase, ids)
    enriched = []
    for row in follow_up_rows:
        row = {**row}
        row["provider_full_name"] = names.get(row.get("provider_id"))
        row["assigned_to_provider_name"] = names.get(row.get("assigned_to_provider_id"))
        enriched.append(row)
    return enriched


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

    A provider override (.get(), since the column only exists once
    20260825070000_risk_assessment_override.sql has been applied) always
    wins outright, in either direction — it IS the completed manual
    review, so it resolves "pending" the same way a high/medium
    final_level does.
    """
    if assessment_row is None:
        return "pending"
    override = assessment_row.get("provider_override_level")
    if override:
        return override
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

    # Distinct from check_ins_received above (which counts PATIENTS who
    # have ever submitted at least one check-in, not check-ins in any
    # time window) — this counts actual check-in ROWS received in the
    # last 7 days, across all assigned patients, for the dashboard's
    # "Check-ins This Week" stat.
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    check_ins_this_week = len(
        supabase.table("weekly_check_ins")
        .select("id")
        .in_("patient_id", patient_ids or [_NO_MATCH_SENTINEL])
        .gte("server_received_at", week_ago)
        .execute()
        .data
    )

    return DashboardSummaryOut(
        total_patients=len(patient_ids),
        high_risk=tiers.count("high"),
        medium_risk=tiers.count("medium"),
        pending_review=tiers.count("pending"),
        low_risk=tiers.count("low"),
        check_ins_received=check_ins_received,
        check_ins_this_week=check_ins_this_week,
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
            # The same reason_code can appear twice in risk_reasons — once
            # from the rule engine (source="rule"), once from the AI
            # adapter reaching the same conclusion (source="ai"). Real,
            # not a bug in this query: keeping both rows preserves that
            # provenance for anyone who needs it later. This list is only
            # ever surfaced as a flat label string (QueueRowOut.reason_codes
            # -> the dashboard's "Main features" column), which has no use
            # for showing "Multiple missed doses" twice — dict.fromkeys
            # dedupes while preserving first-seen order.
            reasons = list(dict.fromkeys(r["reason_code"] for r in reasons_result.data))

        row_model = QueueRowOut(
            patient_id=patient_row["id"],
            full_name=patient_row["full_name"],
            age=patient_row["age"],
            tier=tier,
            final_level=assessment_row["final_level"] if assessment_row else None,
            provider_override_level=(
                assessment_row.get("provider_override_level") if assessment_row else None
            ),
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
        .select("id, medication_name, dosage_description, scheduled_time, supply_status, reminder_enabled")
        .eq("patient_id", patient_id)
        .execute()
    )
    bp_result = (
        supabase.table("blood_pressure_readings")
        .select("id, systolic, diastolic, pulse, notes, measured_at, recorded_at")
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
                **{
                    k: assessment_row[k]
                    for k in (
                        "id",
                        "rule_result_level",
                        "ai_suggested_level",
                        "ai_confidence",
                        "final_level",
                        "ai_status",
                        "requires_manual_review",
                        "provider_summary",
                        "model_version",
                        "created_at",
                    )
                },
                reasons=_reasons_for_assessment(supabase, assessment_row["id"]),
                # .get(), not direct indexing: these columns only exist once
                # supabase/migrations/20260820090000_risk_assessment_flags.sql
                # has been applied — falls back to the model's defaults
                # (no feedback recorded) until then, rather than a KeyError.
                feedback=assessment_row.get("feedback"),
                feedback_at=assessment_row.get("feedback_at"),
                feedback_note=assessment_row.get("feedback_note"),
                # .get(), not direct indexing: these columns only exist once
                # 20260825070000_risk_assessment_override.sql has been
                # applied — falls back to "no override recorded" until then.
                provider_override_level=assessment_row.get("provider_override_level"),
                provider_override_at=assessment_row.get("provider_override_at"),
                provider_override_reason=assessment_row.get("provider_override_reason"),
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

    active_assignment = one_or_none(
        supabase.table("patient_provider_assignments")
        .select("provider_id")
        .eq("patient_id", patient_id)
        .eq("is_active", True)
        .order("assigned_at", desc=True)
    )
    assigned_provider_name = (
        _provider_names_by_id(supabase, [active_assignment["provider_id"]]).get(
            active_assignment["provider_id"]
        )
        if active_assignment
        else None
    )

    return PatientDetailOut(
        profile=PatientSummaryOut(**patient_row),
        medications=[MedicationOut(**m) for m in medications_result.data],
        latest_bp=latest_bp,
        latest_check_in=latest_check_in,
        open_alerts=[AlertOut(**a) for a in alerts_result.data],
        follow_ups=[
            FollowUpActionOut(**f) for f in _attach_provider_names(supabase, follow_ups_result.data)
        ],
        assigned_provider_name=assigned_provider_name,
    )


# --- Timeline ------------------------------------------------------------


@router.get("/provider/colleagues", response_model=list[ColleagueOut])
def list_colleagues(
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    """Every other provider — populates the "Reassign to" dropdown."""
    provider_id = get_provider_profile_id(supabase, user.id)
    result = (
        supabase.table("provider_profiles")
        .select("id, full_name")
        .neq("id", provider_id)
        .order("full_name")
        .execute()
    )
    return [ColleagueOut(**r) for r in result.data]


@router.post("/provider/patients/{patient_id}/reassign", status_code=status.HTTP_204_NO_CONTENT)
def reassign_patient(
    patient_id: str,
    body: ReassignPatientRequest,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Moves this patient from the calling provider to another one: the
    caller's own assignment is deactivated and the target provider's is
    activated (reusing a prior assignment row for that pair if one
    exists, rather than accumulating duplicates). patient_provider_
    assignments' own assigned_at/unassigned_at timestamps are the audit
    trail — there's no separate reassignment log table.

    Once this returns, the calling provider loses access to this patient
    (require_assigned_patient will 404 for them from here on), so this is
    a one-way action from their point of view.
    """
    if body.to_provider_id == assignment.provider_profile_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot reassign a patient to yourself",
        )
    target_provider = one_or_none(
        supabase.table("provider_profiles").select("id").eq("id", body.to_provider_id)
    )
    if target_provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    now = datetime.now(timezone.utc).isoformat()

    supabase.table("patient_provider_assignments").update(
        {"is_active": False, "unassigned_at": now}
    ).eq("patient_id", patient_id).eq("provider_id", assignment.provider_profile_id).eq(
        "is_active", True
    ).execute()

    existing_target_assignment = one_or_none(
        supabase.table("patient_provider_assignments")
        .select("id")
        .eq("patient_id", patient_id)
        .eq("provider_id", body.to_provider_id)
    )
    if existing_target_assignment is not None:
        supabase.table("patient_provider_assignments").update(
            {"is_active": True, "assigned_at": now, "unassigned_at": None}
        ).eq("id", existing_target_assignment["id"]).execute()
    else:
        supabase.table("patient_provider_assignments").insert(
            {"patient_id": patient_id, "provider_id": body.to_provider_id, "is_active": True}
        ).execute()


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
    for row in _attach_provider_names(supabase, follow_ups_result.data):
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


@router.get("/provider/patients/{patient_id}/bp-readings", response_model=list[BPReadingOut])
def patient_bp_readings(
    patient_id: str,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Full BP reading history for a patient, oldest first — used by the
    provider dashboard's BP trend chart. patient_detail() above only ever
    returns the single latest reading, which isn't enough to plot a trend.
    """
    result = (
        supabase.table("blood_pressure_readings")
        .select("id, systolic, diastolic, pulse, notes, measured_at, recorded_at")
        .eq("patient_id", patient_id)
        .order("measured_at", desc=False)
        .execute()
    )
    return [BPReadingOut(**r) for r in result.data]


@router.get("/provider/patients/{patient_id}/follow-ups", response_model=list[FollowUpActionOut])
def list_follow_ups(
    patient_id: str,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    alert_ids_result = supabase.table("alerts").select("id").eq("patient_id", patient_id).execute()
    alert_ids = [a["id"] for a in alert_ids_result.data] or [_NO_MATCH_SENTINEL]
    result = (
        supabase.table("follow_up_actions")
        .select("*")
        .in_("alert_id", alert_ids)
        .order("created_at", desc=True)
        .execute()
    )
    return [FollowUpActionOut(**f) for f in _attach_provider_names(supabase, result.data)]


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
                "next_advice": body.next_advice,
                "outcome": body.outcome,
                "status": body.status,
                "contacted_person": body.contacted_person,
                "follow_up_date": body.follow_up_date.isoformat() if body.follow_up_date else None,
                "follow_up_time": body.follow_up_time.isoformat() if body.follow_up_time else None,
                "assigned_to_provider_id": body.assigned_to_provider_id,
                "notify_patient": body.notify_patient,
                "next_action_date": (
                    body.next_action_date.isoformat() if body.next_action_date else None
                ),
            }
        )
        .execute()
    )

    # Actually change the alert's own status when the caller asked for
    # that — without this, picking "Resolved" in the follow-up form only
    # updated this follow_up_actions row and left the alert open forever.
    if body.alert_status is not None and body.alert_status != alert["status"]:
        _apply_alert_status(
            supabase, body.alert_id, body.alert_status, assignment.provider_profile_id
        )

    return FollowUpActionOut(**_attach_provider_names(supabase, result.data)[0])


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

    return AlertOut(**_apply_alert_status(supabase, alert_id, body.status, provider_id))


# --- Risk assessment feedback -----------------------------------------------


@router.patch(
    "/provider/risk-assessments/{assessment_id}/feedback",
    response_model=RiskAssessmentFeedbackOut,
)
def submit_risk_assessment_feedback(
    assessment_id: str,
    body: RiskAssessmentFeedbackRequest,
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Records a provider's Helpful / Not helpful / Report an issue verdict
    on the AI-generated summary for this assessment (Risk Assessment
    Review screen). This never edits or removes the original summary —
    it only adds feedback alongside it, so the audit trail stays intact.

    Requires supabase/migrations/20260820090000_risk_assessment_flags.sql
    to have been applied — without it, the underlying columns don't
    exist and this route 500s. Not gated behind a settings flag because
    a clear failure here is preferable to a route that looks like it
    works but silently no-ops.
    """
    provider_id = get_provider_profile_id(supabase, user.id)
    _, patient_id = _get_assessment_with_patient_or_404(supabase, assessment_id)
    if not has_active_assignment(supabase, provider_id, patient_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Risk assessment not found"
        )

    result = (
        supabase.table("risk_assessments")
        .update(
            {
                "feedback": body.feedback,
                "feedback_at": datetime.now(timezone.utc).isoformat(),
                "feedback_by": provider_id,
                "feedback_note": body.feedback_note,
            }
        )
        .eq("id", assessment_id)
        .execute()
    )
    return RiskAssessmentFeedbackOut(**result.data[0])


@router.patch(
    "/provider/risk-assessments/{assessment_id}/override",
    response_model=RiskAssessmentOverrideOut,
)
def override_risk_assessment(
    assessment_id: str,
    body: RiskAssessmentOverrideRequest,
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Records a provider's own risk-level decision for this assessment,
    with a required reason. This is the human clinical decision the
    Risk Assessment Review screen's "Manual review status" area was
    previously just a static "Provider decision pending" label for.

    Distinct from the AI-safety floor rule (AI may only ever raise the
    rule-derived level, never lower it): a provider override is a
    licensed clinician's final judgment and may move the level in either
    direction. It never edits rule_result_level, ai_suggested_level, or
    final_level — those stay exactly as computed, so what the system
    concluded and what the provider decided both remain visible.

    Requires
    supabase/migrations/20260825070000_risk_assessment_override.sql to
    have been applied — without it, the underlying columns don't exist
    and this route 500s, same fail-loud pattern as the feedback endpoint
    above.
    """
    provider_id = get_provider_profile_id(supabase, user.id)
    _, patient_id = _get_assessment_with_patient_or_404(supabase, assessment_id)
    if not has_active_assignment(supabase, provider_id, patient_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Risk assessment not found"
        )

    result = (
        supabase.table("risk_assessments")
        .update(
            {
                "provider_override_level": body.level,
                "provider_override_at": datetime.now(timezone.utc).isoformat(),
                "provider_override_by": provider_id,
                "provider_override_reason": body.reason,
            }
        )
        .eq("id", assessment_id)
        .execute()
    )
    return RiskAssessmentOverrideOut(**result.data[0])


# --- Agent workflow evidence ----------------------------------------------


@router.get(
    "/provider/patients/{patient_id}/agent-runs",
    response_model=list[AgentRunOut],
)
def list_patient_agent_runs(
    patient_id: str,
    assignment: AssignedProviderContext = Depends(require_assigned_patient),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Returns auditable workflow metadata for an assigned patient.

    agent_actions.tool_input/tool_output and agent_runs.error_code/model
    are deliberately not selected, so raw prompts, model payloads, and
    internal failure details cannot be exposed accidentally.
    """
    runs_result = (
        supabase.table("agent_runs")
        .select("id, check_in_id, patient_id, status, started_at, completed_at, created_at")
        .eq("patient_id", patient_id)
        .order("started_at", desc=True)
        .execute()
    )
    if not runs_result.data:
        return []

    run_ids = [row["id"] for row in runs_result.data]
    actions_result = (
        supabase.table("agent_actions")
        .select(
            "id, agent_run_id, agent_name, action_type, status, "
            "requires_provider_approval, created_at"
        )
        .in_("agent_run_id", run_ids)
        .order("created_at", desc=False)
        .execute()
    )
    actions_by_run: dict[str, list[AgentActionSummaryOut]] = {run_id: [] for run_id in run_ids}
    for action in actions_result.data:
        actions_by_run[action["agent_run_id"]].append(
            AgentActionSummaryOut(
                **{
                    key: action[key]
                    for key in (
                        "id",
                        "agent_name",
                        "action_type",
                        "status",
                        "requires_provider_approval",
                        "created_at",
                    )
                }
            )
        )

    return [AgentRunOut(**run, actions=actions_by_run[run["id"]]) for run in runs_result.data]


# --- Agent-generated follow-up tasks --------------------------------------


@router.get("/provider/follow-up-tasks", response_model=list[FollowUpTaskOut])
def list_follow_up_tasks(
    task_status: FollowUpTaskStatus | None = Query(default=None, alias="status"),
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Lists unclaimed tasks and tasks owned by the current provider for
    actively assigned patients. Tasks claimed by another provider are
    omitted even when both providers are assigned to the same patient.
    """
    provider_id = get_provider_profile_id(supabase, user.id)
    assignments = (
        supabase.table("patient_provider_assignments")
        .select("patient_id")
        .eq("provider_id", provider_id)
        .eq("is_active", True)
        .execute()
    )
    patient_ids = [row["patient_id"] for row in assignments.data]
    if not patient_ids:
        return []

    query = (
        supabase.table("follow_up_tasks")
        .select(
            "id, patient_id, agent_run_id, task_type, priority, rationale, "
            "status, provider_id, due_at, created_at, completed_at"
        )
        .in_("patient_id", patient_ids)
    )
    if task_status is not None:
        query = query.eq("status", task_status)
    result = query.order("created_at", desc=True).execute()

    visible_rows = [row for row in result.data if row.get("provider_id") in (None, provider_id)]
    priority_order = {"high": 0, "medium": 1, "low": 2}
    # The query already returns newest first. Python's sort is stable, so
    # sorting only by priority preserves that order within each priority.
    visible_rows.sort(key=lambda row: priority_order.get(row["priority"], 9))
    return [FollowUpTaskOut(**row) for row in visible_rows]


@router.patch(
    "/provider/follow-up-tasks/{task_id}",
    response_model=FollowUpTaskOut,
)
def update_follow_up_task(
    task_id: str,
    body: FollowUpTaskPatchRequest,
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
):
    """Claims and advances an authorized agent-generated follow-up task."""
    provider_id = get_provider_profile_id(supabase, user.id)
    task = get_follow_up_task_or_404(supabase, task_id)

    if not has_active_assignment(supabase, provider_id, task["patient_id"]):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Follow-up task not found",
        )
    if task.get("provider_id") not in (None, provider_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Follow-up task not found",
        )

    current_status = task["status"]
    if body.status not in FOLLOW_UP_TASK_TRANSITIONS[current_status]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition follow-up task from {current_status} to {body.status}",
        )

    # An identical status is an idempotent retry and performs no write.
    if body.status == current_status:
        return FollowUpTaskOut(**task)

    update_fields: dict = {"status": body.status}
    if task.get("provider_id") is None:
        update_fields["provider_id"] = provider_id
    if body.status == "completed":
        update_fields["completed_at"] = datetime.now(timezone.utc).isoformat()

    # Compare-and-set both owner and status. This prevents two assigned
    # providers from claiming the same unowned task concurrently and
    # prevents a stale client from overwriting a newer transition.
    update_query = (
        supabase.table("follow_up_tasks")
        .update(update_fields)
        .eq("id", task_id)
        .eq("status", current_status)
    )
    if task.get("provider_id") is None:
        update_query = update_query.is_("provider_id", "null")
    else:
        update_query = update_query.eq("provider_id", provider_id)
    result = update_query.execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Follow-up task changed; refresh and try again",
        )
    return FollowUpTaskOut(**result.data[0])
