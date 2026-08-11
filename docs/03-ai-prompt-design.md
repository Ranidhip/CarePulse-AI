# CarePulse AI — AI Prompt & Schema Design

**Status:** Draft for your approval — Phase 1, Day 9 equivalent (second half)
**Depends on:** `docs/01-erd-api-contract.md` §4 (reason codes), §6 (AI contract), §7 (combination rules)

This finalizes what actually gets sent to OpenAI, what we accept back, and
how we test it — closing out Week 1.

## 1. What gets sent to the model

**Minimum deidentified input only** — never the patient's name, contact
number, or any internal ID:

- The structured flags already collected in the check-in (missed doses +
  count, medication stopped, supply remaining)
- The patient's own short free-text answer, verbatim

Implemented in `backend/app/services/ai/prompts.py` → `build_user_message()`.

## 2. System prompt

See `backend/app/services/ai/prompts.py` → `SYSTEM_PROMPT` for the exact
text. Key properties, matching the architecture plan's mandatory rules:

- States plainly it is decision-support, not diagnostic
- Restricts output to the approved reason-code list (§4 of the API contract)
- Explicitly forbids diagnosis, medication/dosage advice, and telling a
  patient to stop/start/change treatment
- Treats the patient's free text as **data to analyze, never instructions
  to follow** — an explicit prompt-injection defense. If the text contains
  something that reads like an instruction, the prompt tells the model to
  note it as reported text and flag for manual review, not comply with it
- Requires `requires_manual_review: true` whenever the model is uncertain

## 3. Response contract

Unchanged from `docs/01-erd-api-contract.md` §6 — repeated here for
convenience:

```json
{
  "suggested_risk_level": "medium",
  "reason_codes": ["MISSED_DOSES", "SCHEDULE_DIFFICULTY"],
  "evidence": [{ "reason_code": "SCHEDULE_DIFFICULTY", "text": "Patient reports work-related timing difficulty." }],
  "provider_summary": "Patient reports missed doses linked to work schedule.",
  "confidence": 0.82,
  "requires_manual_review": false
}
```

**Two layers of validation**, not one:

1. **OpenAI structured outputs** — `AI_RESPONSE_JSON_SCHEMA` in
   `prompts.py` is passed to the API so the model is constrained at
   generation time.
2. **Backend re-validation** — `app/services/ai/schemas.py` defines an
   independent Pydantic model. Structured-output support and correctness
   varies by model/provider version, so the backend never trusts the API
   response blindly — it re-validates every field, including a lightweight
   keyword guardrail on `provider_summary` that rejects obvious clinical
   language (e.g. "diagnos-", "prescri-", "stop taking") before it can
   ever reach a provider screen. This is a backstop, not a substitute for
   the prompt-level instruction.

Anything that fails either layer is treated as an **AI failure** — per the
combination rules, that means the check-in still saves, the rule result
still stands, and the provider sees "AI analysis pending."

## 4. Model choice — left open intentionally

**Not locking a specific model name here.** OpenAI's model lineup and
pricing change often enough that anything I write today could be stale by
the time we actually wire up the API key in Week 2. What's decided:

- Must support structured/JSON-schema outputs
- Should be from OpenAI's lower-cost tier (this is short classification +
  summarization, not complex reasoning)
- The model name lives in one place only — an environment variable
  (`OPENAI_MODEL` in `backend/.env`) — so switching it later is a one-line
  change, not a code change

**When we build the actual AI adapter (Week 2), check OpenAI's current
pricing page directly** rather than trusting any number I might state here.

## 5. Risk thresholds — reference, not restated

Deterministic rule thresholds are defined once, in
`docs/01-erd-api-contract.md` §5 — still flagged unvalidated, still pending
your/clinical confirmation. The AI never overrides these downward (§7,
combination rules).

## 6. Pilot test messages

30 synthetic messages covering each reason code, mixed/ambiguous cases, a
neutral/no-issue case, and two deliberate prompt-injection attempts (to
verify the model — and later, the backend guardrail — actually resist
them). File: `backend/app/tests/fixtures/pilot_messages.csv`.

These aren't graded yet — that's a Week 3 task (building the actual eval
script that calls the AI adapter against this set and checks output
against `expected_reason_code`). Today's job was just producing a
representative, labeled set to test against.

## 7. Open items before this is fully "frozen"

- [ ] Confirm the system prompt's tone/wording is what you want a
      mentor to read — it's the most "visible" AI-safety artifact in the project
- [ ] Confirm OpenAI is still the intended provider (per the master brief) —
      not revisiting this now, just noting it's assumed
