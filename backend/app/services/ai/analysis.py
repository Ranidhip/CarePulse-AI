"""
Live AI adapter — wires the existing prompt/schema (app/services/ai/
prompts.py, schemas.py) into a real OpenAI call using the Responses API's
.parse() helper.

Verified against the actually-installed openai==3.3.0 package before any
of this was written (see the Phase 3 planning discussion — 1.51.0 has no
Responses API at all; Chat Completions was deliberately NOT used as a
substitute, per the confirmed architecture decision). Confirmed real
signatures/fields used here:
  - Responses.parse(text_format=<PydanticModel>, input=<str>,
    instructions=<str>, model=<str>) -> ParsedResponse[T]
  - ParsedResponse.output_parsed -> T | None (None on refusal or no
    parseable output)
  - ParsedResponse.status -> "completed" | "failed" | "incomplete" | ...
  - ParsedResponse.error / .incomplete_details -> populated on failure
  - openai.{NotFoundError, RateLimitError, APITimeoutError, OpenAIError}

Two independent validation layers, per the safety requirement:
  1. Structured Outputs (text_format=AIResponse) constrains generation at
     the API level.
  2. This module independently re-validates the parsed result
     (AIResponse.model_validate(...)) before returning it — belt-and-
     suspenders on top of whatever validation .parse() does internally,
     so this code's own safety guarantee never silently depends on an
     SDK internal we haven't fully verified.

Never raises to the caller. Every failure path (timeout, rate limit,
model not found, refusal, incomplete/failed response, revalidation
failure, or any other error) is caught and returned as a failed
AIAnalysisOutcome. The caller (app/api/checkins.py) decides what a
failure means for the check-in — this module has no opinion on risk
levels or fallback summaries beyond reporting success or failure.

Never logs the patient's free-text answer or any raw model output — only
error codes and exception type names.
"""

import logging
from dataclasses import dataclass

import openai

from app.services.ai.prompts import SYSTEM_PROMPT, build_user_message
from app.services.ai.schemas import AIResponse

logger = logging.getLogger(__name__)


@dataclass
class AIAnalysisOutcome:
    status: str  # "completed" or "failed"
    ai_response: AIResponse | None
    model_version: str | None
    error_code: str | None


def _extract_refusal_text(response) -> str | None:
    """
    Best-effort scan of the response output for a refusal content item.
    Defensive by design: never raises, and doesn't assume an exact
    attribute name beyond `type == "refusal"` plus a couple of common
    fallbacks, since the exact refusal content shape wasn't independently
    verified against installed source the way the success path was.
    """
    try:
        for item in getattr(response, "output", []) or []:
            if getattr(item, "type", None) != "message":
                continue
            for content in getattr(item, "content", []) or []:
                if getattr(content, "type", None) == "refusal":
                    return getattr(content, "refusal", None) or str(content)
    except Exception:
        return None
    return None


def run_ai_analysis(
    client,
    *,
    model: str,
    difficulty_text: str | None,
    missed_doses: bool,
    missed_dose_count: int | None,
    medication_stopped: bool,
    supply_remaining: bool,
) -> AIAnalysisOutcome:
    """
    Runs one AI analysis call for a single check-in. `client` is anything
    exposing `.responses.parse(...)` with the same shape as a real
    openai.OpenAI client — tests pass a hand-built fake here directly,
    never a real client, and never make a network call.
    """
    user_message = build_user_message(
        difficulty_text=difficulty_text,
        missed_doses=missed_doses,
        missed_dose_count=missed_dose_count,
        medication_stopped=medication_stopped,
        supply_remaining=supply_remaining,
    )

    try:
        response = client.responses.parse(
            model=model,
            instructions=SYSTEM_PROMPT,
            input=user_message,
            text_format=AIResponse,
        )
    except openai.NotFoundError:
        logger.warning("AI analysis failed: model '%s' not found on this account", model)
        return AIAnalysisOutcome(
            status="failed", ai_response=None, model_version=None, error_code="AI_MODEL_NOT_FOUND"
        )
    except openai.RateLimitError:
        logger.warning("AI analysis failed: rate limited")
        return AIAnalysisOutcome(
            status="failed", ai_response=None, model_version=None, error_code="AI_RATE_LIMITED"
        )
    except openai.APITimeoutError:
        logger.warning("AI analysis failed: timed out")
        return AIAnalysisOutcome(
            status="failed", ai_response=None, model_version=None, error_code="AI_TIMEOUT"
        )
    except openai.OpenAIError as e:
        logger.warning("AI analysis failed: %s", type(e).__name__)
        return AIAnalysisOutcome(
            status="failed", ai_response=None, model_version=None, error_code="AI_REQUEST_FAILED"
        )
    except Exception:
        logger.exception("AI analysis failed: unexpected error")
        return AIAnalysisOutcome(
            status="failed", ai_response=None, model_version=None, error_code="AI_UNEXPECTED_ERROR"
        )

    response_status = getattr(response, "status", None)
    if response_status not in (None, "completed"):
        logger.warning("AI analysis failed: response status=%s", response_status)
        return AIAnalysisOutcome(
            status="failed",
            ai_response=None,
            model_version=getattr(response, "model", None),
            error_code=f"AI_RESPONSE_{str(response_status).upper()}",
        )

    parsed = getattr(response, "output_parsed", None)
    if parsed is None:
        refusal_text = _extract_refusal_text(response)
        error_code = "AI_REFUSED" if refusal_text else "AI_NO_PARSED_OUTPUT"
        logger.warning("AI analysis failed: %s", error_code)
        return AIAnalysisOutcome(
            status="failed",
            ai_response=None,
            model_version=getattr(response, "model", None),
            error_code=error_code,
        )

    # Independent revalidation (layer 2) — belt-and-suspenders on top of
    # whatever .parse() already did. Catches malformed reason codes,
    # banned clinical language in provider_summary, or any other
    # AIResponse constraint, regardless of what the SDK itself enforced.
    try:
        validated = AIResponse.model_validate(parsed.model_dump())
    except Exception:
        logger.warning("AI analysis failed: independent revalidation rejected the response")
        return AIAnalysisOutcome(
            status="failed",
            ai_response=None,
            model_version=getattr(response, "model", None),
            error_code="AI_VALIDATION_FAILED",
        )

    return AIAnalysisOutcome(
        status="completed",
        ai_response=validated,
        model_version=getattr(response, "model", None),
        error_code=None,
    )
