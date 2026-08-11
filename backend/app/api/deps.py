"""
Role-based access dependencies, built on top of app.core.security.

Usage in a route:

    from app.api.deps import require_provider

    @router.get("/provider/patients")
    def list_patients(user: CurrentUser = Depends(require_provider)):
        ...

Note: these only check the caller's *role*. Routes that target a specific
patient (e.g. GET /provider/patients/{id}) must additionally check for an
active patient_provider_assignments row and return 404 (not 403) if none
exists — see docs/02-auth-design.md §3. That per-resource check gets added
alongside each route as it's built, not here.
"""

from fastapi import Depends, HTTPException, status

from app.core.security import CurrentUser, get_current_user


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
