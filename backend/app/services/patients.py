"""
Shared helpers for resolving a patient_profiles row from the authenticated
user. Used by every /patient/* route. Previously duplicated inline in
app/api/checkins.py — centralised here in Phase 2 so app/api/patient.py
doesn't redefine the same lookup.
"""

from fastapi import HTTPException, status
from supabase import Client

from app.core.db import one_or_none


def get_patient_profile_id(supabase: Client, user_id: str) -> str:
    """
    Returns the patient_profiles.id for the given auth user id.

    Raises 404 if this account has no patient profile — this can only
    legitimately happen if a "patient" role user was created without a
    profile row, which should not occur through normal seeding/sign-up,
    but must fail clearly rather than silently if it ever does.

    Uses one_or_none() (.limit(1), never .maybe_single()/.single()) — see
    app/core/db.py for why: .maybe_single() crashes on zero rows, which
    is exactly the case this "does a profile exist" check needs to
    handle cleanly.
    """
    row = one_or_none(
        supabase.table("patient_profiles").select("id").eq("user_id", user_id)
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patient profile found for this account",
        )
    return row["id"]
