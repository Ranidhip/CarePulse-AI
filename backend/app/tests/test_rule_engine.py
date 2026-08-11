"""
Unit tests for the deterministic risk-rule engine.

These are the most safety-critical tests in the project: the rule engine
is the floor the AI can never go below, so every threshold case here
matters more than most other tests in the codebase.
"""

from app.services.rules.engine import RuleInput, evaluate


def base_input(**overrides) -> RuleInput:
    defaults = dict(
        medication_stopped=False,
        missed_dose_count=0,
        supply_remaining=True,
        difficulty_reported=False,
        systolic=118,
        diastolic=76,
    )
    defaults.update(overrides)
    return RuleInput(**defaults)


def test_stopped_medication_is_always_high():
    result = evaluate(base_input(medication_stopped=True))
    assert result.risk_level == "high"
    assert "MEDICATION_STOPPED" in result.reason_codes


def test_severely_high_systolic_is_high_risk():
    result = evaluate(base_input(systolic=185))
    assert result.risk_level == "high"
    assert "ABNORMAL_BP" in result.reason_codes


def test_severely_high_diastolic_is_high_risk():
    result = evaluate(base_input(diastolic=125))
    assert result.risk_level == "high"
    assert "ABNORMAL_BP" in result.reason_codes


def test_multiple_missed_doses_is_medium():
    result = evaluate(base_input(missed_dose_count=3))
    assert result.risk_level == "medium"
    assert "MISSED_DOSES" in result.reason_codes


def test_single_missed_dose_below_threshold_is_low():
    result = evaluate(base_input(missed_dose_count=1))
    assert result.risk_level == "low"


def test_low_supply_is_medium():
    result = evaluate(base_input(supply_remaining=False))
    assert result.risk_level == "medium"
    assert "LOW_SUPPLY" in result.reason_codes


def test_difficulty_reported_is_medium():
    result = evaluate(base_input(difficulty_reported=True))
    assert result.risk_level == "medium"
    assert "SCHEDULE_DIFFICULTY" in result.reason_codes


def test_no_issues_is_low_with_no_reasons():
    result = evaluate(base_input())
    assert result.risk_level == "low"
    assert result.reason_codes == []


def test_high_risk_takes_priority_over_medium_signals():
    # Stopped medication AND missed doses AND low supply all at once -
    # must still return "high", never get diluted into "medium".
    result = evaluate(base_input(
        medication_stopped=True,
        missed_dose_count=5,
        supply_remaining=False,
        difficulty_reported=True,
    ))
    assert result.risk_level == "high"


def test_reason_codes_have_no_duplicates():
    result = evaluate(base_input(systolic=185, diastolic=125))
    assert result.reason_codes.count("ABNORMAL_BP") == 1
