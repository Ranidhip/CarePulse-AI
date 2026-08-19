"""
Structured-output schemas for the FollowUpCoordinatorAgent and
ClinicalSafetyAgent.

CheckInAnalysisAgent deliberately reuses app.services.ai.schemas.AIResponse
as its output_type rather than a new duplicate schema — its job (risk
level, reason codes, evidence, provider summary, confidence, manual-review
flag) is exactly what that schema already models, including its
existing banned-clinical-language field_validator.
"""

from typing import Literal

from pydantic import BaseModel, Field

FollowUpTaskType = Literal[
    "nurse_review", "pharmacist_review", "doctor_review", "reminder", "other"
]
Priority = Literal["low", "medium", "high"]


class FollowUpCoordinatorOutput(BaseModel):
    """
    Produced by FollowUpCoordinatorAgent. This agent chooses a workflow
    action — it does NOT calculate clinical risk itself and does not
    change medication. `create_task=False` is a valid, expected output
    for genuinely low-risk cases where no follow-up is warranted.
    """

    create_task: bool
    task_type: FollowUpTaskType | None = None
    priority: Priority | None = None
    rationale: str = Field(..., max_length=400)
    schedule_reminder: bool = False

    def requires_task_fields(self) -> bool:
        return self.create_task and (self.task_type is None or self.priority is None)


class ClinicalSafetyOutput(BaseModel):
    """
    Produced by ClinicalSafetyAgent. Its `approved` field is NECESSARY
    but not SUFFICIENT for a follow-up task to be created — orchestrator.py
    additionally runs a deterministic Python backstop
    (app.services.agents.safety.deterministic_safety_check) regardless of
    what this agent says, per the master brief: "Do not depend on this
    agent alone for safety."
    """

    approved: bool
    concerns: list[str] = Field(default_factory=list, max_length=10)
    rejection_reason: str | None = Field(default=None, max_length=400)
