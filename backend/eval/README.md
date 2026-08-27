# Evaluation dataset & metrics

The Week 3 "evaluation dataset + metrics" deliverable — previously no code
existed for this at all.

## Files

- `generate_dataset.py` — generates `dataset.jsonl`, 100 labeled synthetic
  rows: 57 `structured_boundary` rows (systematic threshold sweeps of the
  deterministic rule engine, ground truth computed by the engine itself)
  and 43 `narrative` rows (hand-written realistic patient free-text
  scenarios, human-labeled, covering all 8 reason codes).
- `dataset.jsonl` — the generated dataset. Re-run `generate_dataset.py`
  any time you want to regenerate it (e.g. after intentionally changing
  a rule threshold).
- `run_eval.py` — scores the deterministic rule engine against the
  dataset: risk-level accuracy, a 3x3 confusion matrix, and multi-label
  precision/recall/F1 per reason code. Costs nothing, runs in under a
  second.

## Running it

```bash
cd backend
.venv\Scripts\Activate.ps1      # or source .venv/Scripts/activate
python eval/generate_dataset.py  # only needed once, or after a rule change
python eval/run_eval.py
```

## Reading the two segments

- **structured_boundary** should always score ~100% — its ground truth
  *is* the rule engine's own output, frozen at generation time. This
  segment is really a regression/coverage test: if it drops below 100%,
  `app/services/rules/engine.py` changed behavior at a threshold since
  the dataset was last generated.
- **narrative** scores meaningfully below 100% (currently ~91% risk-level
  accuracy, ~64% reason-code F1) — and that's expected, not a bug. This
  segment measures the rule engine **alone**, which is structurally blind
  to `difficulty_text`. The gap is the quantified argument for why the AI
  layer (`app/services/agents/`) exists: three reason codes
  (`SIDE_EFFECTS`, `REPEATED_NONRESPONSE`, `OTHER`) can *only* ever come
  from the AI reading free text — the rule engine can never produce them,
  by design.

## Extending this to a real AI-pipeline evaluation

This intentionally does **not** run the real 3-agent AI pipeline
(`orchestrator.run_agent_workflow`) against the dataset — that calls the
live OpenAI API once per row, which costs real credits and takes real
time (100 rows x 3 sequential agent calls each). Not something to wire up
to execute silently.

To do it deliberately, later:

1. `app/tests/agents_fakes.py` already has the pattern for supplying a
   `Model` to the agent-builder functions in
   `app/services/agents/definitions.py` — for a real (not faked) run,
   pass the production model string the same way `app/main.py` does at
   startup.
2. `orchestrator.run_agent_workflow` writes to real `agent_runs` /
   `risk_assessments` rows and expects a real `check_in_id` /
   `patient_id` to exist — either seed 100 throwaway check-ins first (and
   clean them up after), or add a thinner wrapper that calls the three
   `build_*_agent()` functions and `Runner` directly, bypassing the
   DB-writing parts of the orchestrator, for a pure in-memory eval run.
3. Compare the AI's `reason_codes` and `final_level` output to this
   dataset's `expected_reason_codes` / `expected_risk_level` using the
   same `reason_code_prf()` / confusion-matrix logic already in
   `run_eval.py` — it's written generically against "a list of
   (row, prediction) pairs" specifically so it can be reused here.
4. Budget for it: 100 rows x 3 agent calls = 300 OpenAI API calls per
   full eval run. Consider running against a smaller stratified sample
   first.
