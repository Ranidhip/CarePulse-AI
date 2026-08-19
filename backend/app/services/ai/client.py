"""
OpenAI client factory for the live AI adapter (Phase 3).

Uses the Responses API (client.responses), per the confirmed CarePulse
architecture decision — NOT Chat Completions. This required upgrading
openai from 1.51.0 (which has no `responses` resource at all) to 3.3.0,
verified directly against your installed package before any of this was
written: client.responses.parse(text_format=..., input=..., instructions=...)
-> ParsedResponse, with .output_parsed / .status / .error /
.incomplete_details for reading the result.

get_openai_client() is a plain function, not a FastAPI dependency —
deliberately. Constructing an OpenAI client with a missing/empty API key
must never happen on every request regardless of whether AI is enabled;
app/api/checkins.py only calls this inside `if settings.ai_enabled:`, and
wraps that whole block in its own try/except so a construction failure
degrades to the same AI-failure fallback as any other AI error, never a
500. Tests do not need to call this function at all — they pass a fake
client object directly into run_ai_analysis() (see app/services/ai/
analysis.py and app/tests/test_ai_analysis.py).
"""

from openai import OpenAI

from app.core.config import get_settings

settings = get_settings()


def get_openai_client() -> OpenAI:
    return OpenAI(
        api_key=settings.openai_api_key,
        timeout=settings.ai_timeout_seconds,
        max_retries=settings.ai_max_retries,
    )


def verify_model_available(client: OpenAI, model: str) -> tuple[bool, str]:
    """
    Confirms `model` is actually available on the connected OpenAI
    account, per the requirement to verify OPENAI_MODEL before Phase 3
    proceeds. Never raises — returns (True, "") or (False, <clear
    message>) so backend/scripts/check_openai_model.py (and, if ever
    wired into app startup later, the app itself) can report a clear
    configuration error instead of crashing.
    """
    import openai

    try:
        client.models.retrieve(model)
        return True, ""
    except openai.NotFoundError:
        return False, (
            f"Model '{model}' was not found on this OpenAI account. "
            f"Check OPENAI_MODEL in backend/.env against a model your "
            f"account actually has access to."
        )
    except openai.AuthenticationError:
        return False, "OPENAI_API_KEY is missing or invalid — check backend/.env."
    except openai.OpenAIError as e:
        return False, f"Could not reach OpenAI to verify the model: {type(e).__name__}: {e}"
    except Exception as e:
        return False, f"Unexpected error verifying the model: {type(e).__name__}: {e}"
