"""
Role-based access dependencies, built on top of app.core.security.

Usage in a route:

    from app.api.deps import require_provider

    @router.get("/provider/patients")
    def list_patients(user: CurrentUser = Depends(require_provider)):
        ...

Note: require_role() only checks the caller's *role*. Routes that target a
specific patient (e.g. GET /provider/patients/{patient_id}) must
additionally confirm an active patient_provider_assignments row — use
require_assigned_patient below, which does both the role check and the
assignment check, and returns 404 (not 403) when no active assignment
exists, so a provider cannot use the response code to enumerate which
patient IDs exist (see docs/02-auth-design.md §3).
"""

from fastapi import Depends, HTTPException, status
from supabase import Client

from app.core.security import CurrentUser, get_current_user, get_supabase_client
from app.services.providers import get_provider_profile_id, has_active_assignment


def require_role(*allowed_roles: str):
    """Factory: returns a dependency that only allows the given role(s)."""

    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires role: {', '.join(allowed_roles)}",
            )
        return user

    return dependency


require_patient = require_role("patient")
require_provider = require_role("provider")
require_admin = require_role("admin")


class AssignedProviderContext:
    """
    Returned by require_assigned_patient. Bundles what every patient-
    specific provider route needs: the authenticated provider, their
    provider_profiles.id, and the patient_id the assignment was verified
    against — so routes never have to re-derive the provider profile id.
    """

    def __init__(self, user: CurrentUser, provider_profile_id: str, patient_id: str):
        self.user = user
        self.provider_profile_id = provider_profile_id
        self.patient_id = patient_id


def require_assigned_patient(
    patient_id: str,
    user: CurrentUser = Depends(require_provider),
    supabase: Client = Depends(get_supabase_client),
) -> AssignedProviderContext:
    """
    Dependency for any route shaped .../patients/{patient_id}[/...]. Checks:
      1. Caller has the provider role (via require_provider).
      2. Caller has a provider_profiles row.
      3. That provider has an ACTIVE assignment to this patient_id.

    Raises 404 (never 403) on assignment failure, so an unassigned
    provider cannot distinguish "this patient doesn't exist" from "this
    patient exists but isn't mine" — both must look identical.

    `patient_id` is bound automatically by FastAPI from the enclosing
    route's path parameter of the same name.
    """
    provider_profile_id = get_provider_profile_id(supabase, user.id)
    if not has_active_assignment(supabase, provider_profile_id, patient_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return AssignedProviderContext(
        user=user, provider_profile_id=provider_profile_id, patient_id=patient_id
    )
