"""
Validated shape for the AI adapter's response.

Mirrors the JSON contract in docs/03-ai-prompt-design.md and the
reason_code / risk_level enums in the Supabase schema. The backend
validates every AI response against this model before accepting it —
anything that fails validation is treated as an AI failure (see
docs/01-erd-api-contract.md §7: AI failure never blocks check-in storage,
it just falls back to "pending" / "manual review").
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

ReasonCode = Literal[
    "MISSED_DOSES",
    "MEDICATION_STOPPED",
    "LOW_SUPPLY",
    "SIDE_EFFECTS",
    "SCHEDULE_DIFFICULTY",
    "ABNORMAL_BP",
    "REPEATED_NONRESPONSE",
    "OTHER",
]

RiskLevel = Literal["low", "medium", "high"]

# Lightweight guardrail only — catches obvious violations of the "no
# diagnosis / no medication advice" rule. Not a substitute for the
# prompt-level instruction, just a backstop before anything reaches a
# provider screen.
_BANNED_SUMMARY_TERMS = [
    "diagnos",
    "prescri",
    "dosage",
    "stop taking",
    "increase your dose",
    "decrease your dose",
]


class AIEvidence(BaseModel):
    reason_code: ReasonCode
    text: str = Field(..., max_length=280)


class AIResponse(BaseModel):
    suggested_risk_level: RiskLevel
    reason_codes: list[ReasonCode] = Field(..., min_length=1, max_length=5)
    evidence: list[AIEvidence] = Field(..., max_length=5)
    provider_summary: str = Field(..., max_length=400)
    confidence: float = Field(..., ge=0.0, le=1.0)
    requires_manual_review: bool

    @field_validator("provider_summary")
    @classmethod
    def summary_no_clinical_language(cls, v: str) -> str:
        lowered = v.lower()
        for term in _BANNED_SUMMARY_TERMS:
            if term in lowered:
                raise ValueError(
                    f"provider_summary contains disallowed clinical language: '{term}'"
                )
        return v
