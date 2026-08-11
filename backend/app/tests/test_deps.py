"""
Unit tests for role-based access dependencies.

These test the role-checking logic in isolation using a fake CurrentUser,
without calling Supabase Auth over the network — that end-to-end path gets
tested once real routes exist in Week 2.
"""

import pytest
from fastapi import HTTPException

from app.api.deps import require_role
from app.core.security import CurrentUser


def make_user(role: str) -> CurrentUser:
    return CurrentUser(id="test-id", email="test@example.com", role=role, is_active=True)


def test_require_role_allows_matching_role():
    dependency = require_role("provider")
    user = make_user("provider")
    result = dependency(user=user)
    assert result.role == "provider"


def test_require_role_rejects_wrong_role():
    dependency = require_role("provider")
    user = make_user("patient")
    with pytest.raises(HTTPException) as exc_info:
        dependency(user=user)
    assert exc_info.value.status_code == 403


def test_require_role_accepts_multiple_allowed_roles():
    dependency = require_role("provider", "admin")
    assert dependency(user=make_user("admin")).role == "admin"
    assert dependency(user=make_user("provider")).role == "provider"
    with pytest.raises(HTTPException):
        dependency(user=make_user("patient"))
