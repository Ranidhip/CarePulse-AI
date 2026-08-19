"""
Fake agents.Model for tests — the dependency-injection substitution point
required so automated tests never call the paid OpenAI API. Used by
passing a FakeAgentModel instance as the `model` argument to
run_agent_workflow() instead of a real model-name string.

RESIDUAL VERIFICATION GAP, disclosed explicitly (see PHASE4_FILES.txt):
_model_response_for() below constructs a real agents.ModelResponse whose
.output contains an openai.types.responses ResponseOutputMessage /
ResponseOutputText pair. ModelResponse's own shape (this exact dataclass,
its field names) WAS verified against your installed openai-agents 0.21.1
via inspect.getsource(). The inner ResponseOutputMessage/ResponseOutputText
field names were NOT independently re-verified this session (per the
explicit instruction to stop after the ModelResponse-level check) — they
are built from the same well-established OpenAI Responses output format
already confirmed via openai==3.3.0's own parsed_response.py during Phase
3 (which showed ResponseOutputMessage/ResponseOutputText as the base
classes ParsedResponseOutputMessage/ParsedResponseOutputText extend), but
their own full field list wasn't read directly.

.model_construct() is used deliberately for these two inner objects
instead of their normal constructor — it bypasses Pydantic validation
entirely (sets exactly the given fields, checks nothing), which sidesteps
the "which fields are required" uncertainty. If this construction is
wrong, pytest will fail loudly and specifically inside these tests, not
silently — and the fix is isolated to this one function.
"""

import asyncio
import json
from dataclasses import dataclass
from typing import Any

from agents import Model, ModelResponse, Usage
from openai.types.responses.response_output_message import ResponseOutputMessage
from openai.types.responses.response_output_text import ResponseOutputText


@dataclass
class SleepThenFail:
    """
    Queue item for simulating a slow model call — sleeps `seconds`, then
    raises TimeoutError itself if somehow not cancelled first by the
    orchestrator's own asyncio.wait_for. Used to test bounded timeouts
    (requirement #6) without depending on any real network delay.
    """

    seconds: float


def _model_response_for(structured: Any) -> ModelResponse:
    """
    Wraps `structured` (a Pydantic model instance, or a raw dict/string
    for invalid-output tests) into a ModelResponse shaped like a real
    Responses API completion: one assistant message containing one
    output_text content block whose text is the JSON the orchestrator's
    Runner.run() call will parse against the agent's output_type.
    """
    if hasattr(structured, "model_dump_json"):
        json_text = structured.model_dump_json()
    elif isinstance(structured, (dict, list)):
        json_text = json.dumps(structured)
    else:
        json_text = str(structured)

    text_item = ResponseOutputText.model_construct(
        type="output_text", text=json_text, annotations=[]
    )
    message_item = ResponseOutputMessage.model_construct(
        id="fake-msg-id",
        type="message",
        role="assistant",
        status="completed",
        content=[text_item],
    )
    return ModelResponse(output=[message_item], usage=Usage(), response_id="fake-response-id")


class FakeAgentModel(Model):
    """
    Queue-based fake model: each call to get_response() consumes the next
    item from `responses`, in order. The orchestrator always calls exactly
    three agents in a fixed sequence (analysis, coordinator, safety), so a
    simple FIFO queue is sufficient — no need to match on instructions.

    Each queued item is one of:
      - a Pydantic model instance (or dict/string) -> wrapped into a
        successful ModelResponse via _model_response_for().
      - an Exception instance -> raised directly from get_response().
      - a SleepThenFail(seconds) -> awaits asyncio.sleep(seconds) first,
        to test the orchestrator's own timeout wrapper.
    """

    def __init__(self, responses: list):
        self._responses = list(responses)
        self.call_count = 0
        self.call_instructions: list[str | None] = []

    async def get_response(
        self,
        system_instructions,
        input,
        model_settings,
        tools,
        output_schema,
        handoffs,
        tracing,
        *,
        previous_response_id,
        conversation_id,
        prompt,
    ) -> ModelResponse:
        self.call_instructions.append(system_instructions)
        if self.call_count >= len(self._responses):
            raise AssertionError(
                f"FakeAgentModel.get_response called {self.call_count + 1} times, "
                f"but only {len(self._responses)} responses were queued."
            )
        item = self._responses[self.call_count]
        self.call_count += 1

        if isinstance(item, SleepThenFail):
            await asyncio.sleep(item.seconds)
            raise TimeoutError("FakeAgentModel: slept past the expected timeout window")
        if isinstance(item, Exception):
            raise item
        return _model_response_for(item)

    async def stream_response(self, *args, **kwargs):
        raise NotImplementedError("FakeAgentModel does not support streaming")
        yield  # pragma: no cover — makes this a generator function, never reached
