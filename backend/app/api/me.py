"""
Current-user endpoint. Every client calls this right after login to find
out who they are, what role they have, and which app screen to route to.
"""

from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user

router = APIRouter()


@router.get("/me")
def get_me(user: CurrentUser = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
    }
