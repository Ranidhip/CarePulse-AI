# Change: CarePulse Working Prototype (Web)

## Why

Week 1 delivered a working FastAPI backend (auth, deterministic risk engine,
`/patient/check-ins` tracer-bullet route) but no usable UI. The mentor
checkpoint requires a demonstrable end-to-end workflow: patient check-in ->
risk assessment -> provider priority queue -> patient detail -> follow-up
action, running locally in a browser.

## What Changes

- Add patient-facing screens to `apps/web` (role select, dashboard, weekly
  check-in form, submission confirmation) — mobile-responsive, same Vite app
  as the provider dashboard.
- Add new backend routes: `GET /provider/patients` (priority queue) and
  `GET /provider/patients/{id}` (detail), reusing the existing auth deps
  and rule engine — no new risk logic.
- Add a `POST /provider/patients/{id}/follow-up` route to record follow-up
  actions (type, notes, status).
- Add a deterministic, clearly-labelled fallback clinical summary generator
  (real OpenAI call if the key works; fallback text if not) — isolated
  behind one service function.
- Seed 6 fictional demo patients across the risk spectrum once the
  Supabase key-format blocker is resolved.
- Provider dashboard UI: overview counts, filterable/sortable priority
  queue, patient detail view, follow-up form.

## What Does NOT Change

- The deterministic rule engine (`app/services/rules/engine.py`) — reused
  as-is, it is the risk floor and is not touched by this change.
- The existing auth/role dependencies (`app/api/deps.py`,
  `app/core/security.py`) — reused as-is.
- The Supabase schema/migrations — reused as-is, no new tables unless a
  gap is found while wiring the provider routes.
- `apps/mobile` (Expo) — explicitly out of scope, deferred to a future
  change once this web prototype is demoed.

## Safety Constraints (non-negotiable, carried from project scope-freeze)

- AI never lowers a risk level the rule engine set; it may only raise it
  or add context.
- Original patient check-in answers are stored before any AI processing
  and are never overwritten.
- This is an educational prototype: no diagnosis, no prescribing, no
  dosage guidance, anywhere in the UI or generated text.
- Provider routes for a specific patient return 404 (not 403) when no
  active assignment exists.

## Impact

- Affected specs: new `provider-dashboard` and `patient-checkin-ui`
  capabilities (this project has no prior spec'd capabilities to modify).
- Affected code: `apps/web/src/**` (new), `backend/app/api/provider.py`
  (new), `backend/app/services/ai/summary.py` (new), demo seed script
  (existing, needs the key-format fix).
