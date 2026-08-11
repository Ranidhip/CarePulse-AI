"""
Deterministic risk-rule engine — the safety floor.

Implements the prototype thresholds from docs/01-erd-api-contract.md §5.
These are placeholder values pending clinical sign-off (flagged in both the
scope-freeze and ERD docs) — kept configurable in one place here so they're
easy to update later without touching any calling code.

This engine only ever looks at structured, patient-entered fields — never
the free-text description. Free text is the AI adapter's job. The AI is
never allowed to lower what this engine decides (see
docs/01-erd-api-contract.md §7, risk combination rules).
"""

from dataclasses import dataclass, field

RULE_VERSION = "v1-prototype-unvalidated"

# --- Configurable thresholds (UNVALIDATED - pending clinical confirmation) ---
HIGH_SYSTOLIC_THRESHOLD = 180
HIGH_DIASTOLIC_THRESHOLD = 120
MEDIUM_MISSED_DOSE_COUNT_THRESHOLD = 2


@dataclass
class RuleInput:
    medication_stopped: bool
    missed_dose_count: int | None
    supply_remaining: bool
    difficulty_reported: bool
    systolic: int | None
    diastolic: int | None


@dataclass
class RuleResult:
    risk_level: str  # "low" | "medium" | "high"
    reason_codes: list[str] = field(default_factory=list)
    rule_version: str = RULE_VERSION


def evaluate(rule_input: RuleInput) -> RuleResult:
    """
    Evaluates the deterministic safety rules against one check-in's
    structured fields. Returns the MINIMUM risk level the system is
    allowed to show — the AI adapter may raise this later, never lower it.
    """
    reason_codes: list[str] = []

    def add_reason(code: str) -> None:
        if code not in reason_codes:
            reason_codes.append(code)

    # --- High risk ---
    is_high = False

    if rule_input.medication_stopped:
        is_high = True
        add_reason("MEDICATION_STOPPED")

    bp_abnormal = (
        rule_input.systolic is not None and rule_input.systolic >= HIGH_SYSTOLIC_THRESHOLD
    ) or (
        rule_input.diastolic is not None and rule_input.diastolic >= HIGH_DIASTOLIC_THRESHOLD
    )
    if bp_abnormal:
        is_high = True
        add_reason("ABNORMAL_BP")

    if is_high:
        return RuleResult(risk_level="high", reason_codes=reason_codes, rule_version=RULE_VERSION)

    # --- Medium risk ---
    is_medium = False

    if (
        rule_input.missed_dose_count is not None
        and rule_input.missed_dose_count >= MEDIUM_MISSED_DOSE_COUNT_THRESHOLD
    ):
        is_medium = True
        add_reason("MISSED_DOSES")

    if not rule_input.supply_remaining:
        is_medium = True
        add_reason("LOW_SUPPLY")

    if rule_input.difficulty_reported:
        is_medium = True
        add_reason("SCHEDULE_DIFFICULTY")

    if is_medium:
        return RuleResult(risk_level="medium", reason_codes=reason_codes, rule_version=RULE_VERSION)

    # --- Low risk ---
    return RuleResult(risk_level="low", reason_codes=[], rule_version=RULE_VERSION)
