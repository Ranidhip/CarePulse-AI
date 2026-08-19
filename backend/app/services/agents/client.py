"""
Model-selection factory for the Phase 4 agent workflow — the DI point in
app/api/checkins.py, mirroring app.services.ai.client.get_openai_client's
role in Phase 3. Returns a plain model-name string in production; tests
monkeypatch this function to return a FakeAgentModel instance instead, so
checkins.py's route-level tests never touch the paid API. Orchestrator-
level unit tests (test_agent_orchestrator.py) bypass this entirely by
calling run_agent_workflow() directly with a FakeAgentModel.
"""

from app.core.config import get_settings


def get_agent_model() -> str:
    return get_settings().openai_model
