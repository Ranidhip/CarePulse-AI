"""
Direct unit tests for app.services.agents.safety.deterministic_safety_check.
Deliberately isolated from the agents SDK entirely — this is the one
safety check that must be certain regardless of anything uncertain about
the SDK's own internal validation behavior.
"""

from app.services.agents.safety import deterministic_safety_check


def test_passes_clean_summary():
    ok, reason = deterministic_safety_check("Patient reported missing one dose this week.")
    assert ok is True
    assert reason is None


def test_passes_none_text():
    ok, reason = deterministic_safety_check(None)
    assert ok is True


def test_passes_empty_text():
    ok, reason = deterministic_safety_check("")
    assert ok is True


def test_blocks_medication_recommendation():
    ok, reason = deterministic_safety_check("Patient should increase your dose immediately.")
    assert ok is False
    assert "increase your dose" in reason


def test_blocks_diagnosis_language():
    ok, reason = deterministic_safety_check("This diagnoses as a side effect of the medication.")
    assert ok is False


def test_blocks_stop_taking_instruction():
    ok, reason = deterministic_safety_check("Advised patient to stop taking the medication.")
    assert ok is False
