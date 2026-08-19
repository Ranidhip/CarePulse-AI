"""
Factory functions for the three approved CarePulse agents. Every agent's
`model` parameter is injected by the caller — a plain model-name string in
production (app.core.config.Settings.openai_model), a fake agents.Model
instance in tests (see app/tests/agents_fakes.py). This is the DI point
required so automated tests never call the paid API: orchestrator.py never
constructs a real model itself, it only ever receives one as an argument.

Exactly three agents exist here, matching the master brief and the
agent_name DB enum in the Phase 1 migration (which independently locks
this to exactly these three names at the database level):
  - CheckInAnalysisAgent
  - FollowUpCoordinatorAgent
  - ClinicalSafetyAgent
"""

from agents import Agent, Model, ModelSettings

from app.services.agents.prompts import CLINICAL_SAFETY_PROMPT, FOLLOW_UP_COORDINATOR_PROMPT
from app.services.agents.schemas import ClinicalSafetyOutput, FollowUpCoordinatorOutput
from app.services.ai.prompts import SYSTEM_PROMPT
from app.services.ai.schemas import AIResponse


def build_check_in_analysis_agent(model: str | Model, timeout_seconds: float) -> Agent:
    return Agent(
        name="CheckInAnalysisAgent",
        instructions=SYSTEM_PROMPT,
        model=model,
        model_settings=ModelSettings(timeout=timeout_seconds),
        output_type=AIResponse,
    )


def build_follow_up_coordinator_agent(model: str | Model, timeout_seconds: float) -> Agent:
    return Agent(
        name="FollowUpCoordinatorAgent",
        instructions=FOLLOW_UP_COORDINATOR_PROMPT,
        model=model,
        model_settings=ModelSettings(timeout=timeout_seconds),
        output_type=FollowUpCoordinatorOutput,
    )


def build_clinical_safety_agent(model: str | Model, timeout_seconds: float) -> Agent:
    return Agent(
        name="ClinicalSafetyAgent",
        instructions=CLINICAL_SAFETY_PROMPT,
        model=model,
        model_settings=ModelSettings(timeout=timeout_seconds),
        output_type=ClinicalSafetyOutput,
    )
