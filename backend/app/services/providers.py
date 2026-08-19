"""
Shared helpers for provider-profile resolution and active-assignment
authorization checks.

Every provider route that targets a specific patient MUST go through
has_active_assignment() (directly or via app.api.deps.require_assigned_patient)
before returning any data about that patient, and MUST return 404 — not
403 — when no active assignment exists, so a provider cannot use the
response code to enumerate which patient IDs exist (see
docs/02-auth-design.md §3).

Every lookup here uses one_or_none() (.limit(1), never .maybe_single()/
.single()) — see app/core/db.py for why .maybe_single() is unsafe.
"""

from fastapi import HTTPException, status
from supabase import Client

from app.core.db import one_or_none


def get_provider_profile_id(supabase: Client, user_id: str) -> str:
    """
    Returns the provider_profiles.id for the given auth user id.

    Raises 404 if this account has no provider profile.
    """
    row = one_or_none(supabase.table("provider_profiles").select("id").eq("user_id", user_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No provider profile found for this account",
        )
    return row["id"]


def has_active_assignment(supabase: Client, provider_id: str, patient_id: str) -> bool:
    """
    True only if there is a row in patient_provider_assignments linking
    this provider to this patient with is_active = true. Mirrors the
    public.has_active_assignment() SQL function used in RLS policies —
    kept as a small, independent Python check because the backend's
    service-role client bypasses RLS and must enforce this itself.
    """
    row = one_or_none(
        supabase.table("patient_provider_assignments")
        .select("id")
        .eq("provider_id", provider_id)
        .eq("patient_id", patient_id)
        .eq("is_active", True)
    )
    return row is not None


def get_patient_or_404(supabase: Client, patient_id: str) -> dict:
    """
    Loads a patient_profiles row by id, or raises 404. Callers must check
    has_active_assignment() as well — this function only confirms the
    patient exists, it does not authorize access to it.
    """
    row = one_or_none(
        supabase.table("patient_profiles")
        .select("id, full_name, age, contact_number")
        .eq("id", patient_id)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return row


def get_alert_or_404(supabase: Client, alert_id: str) -> dict:
    """
    Loads an alerts row (including its patient_id) by id, or raises 404.
    Callers must separately confirm has_active_assignment(provider_id,
    alert["patient_id"]) before allowing access — see PATCH
    /provider/alerts/{alert_id} in app/api/provider.py.
    """
    row = one_or_none(
        supabase.table("alerts")
        .select(
            "id, patient_id, status, risk_assessment_id, created_at, acknowledged_at, acknowledged_by"
        )
        .eq("id", alert_id)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return row
