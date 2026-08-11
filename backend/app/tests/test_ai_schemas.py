"""
Unit tests for the AI response schema.

These test validation logic only, with hand-built dicts standing in for
what the AI adapter would return — no network call to OpenAI happens here.
The real end-to-end call gets built and tested in Week 2.
"""

import pytest
from pydantic import ValidationError

from app.services.ai.schemas import AIResponse


def valid_response(**overrides) -> dict:
    base = {
        "suggested_risk_level": "medium",
        "reason_codes": ["MISSED_DOSES", "SCHEDULE_DIFFICULTY"],
        "evidence": [
            {"reason_code": "SCHEDULE_DIFFICULTY", "text": "Patient reports work-related timing difficulty."}
        ],
        "provider_summary": "Patient reports missed doses linked to work schedule.",
        "confidence": 0.82,
        "requires_manual_review": False,
    }
    base.update(overrides)
    return base


def test_valid_response_parses():
    response = AIResponse(**valid_response())
    assert response.suggested_risk_level == "medium"
    assert response.confidence == 0.82


def test_rejects_unapproved_reason_code():
    with pytest.raises(ValidationError):
        AIResponse(**valid_response(reason_codes=["NOT_A_REAL_CODE"]))


def test_rejects_confidence_out_of_range():
    with pytest.raises(ValidationError):
        AIResponse(**valid_response(confidence=1.5))


def test_rejects_empty_reason_codes():
    with pytest.raises(ValidationError):
        AIResponse(**valid_response(reason_codes=[]))


def test_rejects_clinical_language_in_summary():
    with pytest.raises(ValidationError):
        AIResponse(**valid_response(provider_summary="Patient should stop taking the medication."))


def test_rejects_invalid_risk_level():
    with pytest.raises(ValidationError):
        AIResponse(**valid_response(suggested_risk_level="critical"))
