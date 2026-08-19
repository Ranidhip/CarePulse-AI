"""
Deterministic safety backstop — runs AFTER ClinicalSafetyAgent, regardless
of what it approved. Per the master brief: "Do not depend on this agent
alone for safety. Retain deterministic validation and banned-language
checks in Python."

Reuses the exact same banned-term list AIResponse's own field_validator
already uses (app.services.ai.schemas), so there is one source of truth
for "what counts as disallowed clinical language" rather than two lists
that could drift apart.
"""

from app.services.ai.schemas import _BANNED_SUMMARY_TERMS


def deterministic_safety_check(text: str | None) -> tuple[bool, str | None]:
    """
    Returns (True, None) if `text` contains no banned clinical language,
    or (False, <reason>) if it does. None/empty text passes trivially —
    there's nothing to check.
    """
    if not text:
        return True, None
    lowered = text.lower()
    for term in _BANNED_SUMMARY_TERMS:
        if term in lowered:
            return False, f"Deterministic backstop found disallowed language: '{term}'"
    return True, None
