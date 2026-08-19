# CarePulse AI Phase 7 Mentor Demonstration

> **Important:** Every workflow record created by this guide is synthetic demonstration
> evidence. It is not genuine AI output. No OpenAI request is made.

## 1. Prepare the synthetic workflow

From `backend/`, with `.venv` active and the existing seed-account variables in `.env`:

```powershell
python scripts/seed_synthetic_agent_demo.py --confirm-synthetic-seed
```

The script refuses ordinary profiles, verifies the active synthetic assignment, and is
idempotent. It creates one completed run, the three ordered actions, and two synthetic
tasks only when the required safe markers are present.

## 2. Start the backend

Use any free local port. Port 8765 avoids the stale port-8000 process previously found on
the demonstration laptop:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

Keep this terminal open.

## 3. Start the provider dashboard

Set `apps/web/.env` to the same backend address:

```env
VITE_API_URL=http://127.0.0.1:8765
```

Then, from `apps/web/`:

```powershell
npm run dev
```

## 4. Demonstrate the workflow

1. Sign in with the synthetic provider credentials from `backend/.env`.
2. Open **Patients** and select the synthetic patient.
3. Explain that the deterministic rule engine remains the risk authority and AI cannot
   lower its result.
4. In **AI Agent Workflow**, show the completed run and the ordered evidence:
   `CheckInAnalysisAgent`, `FollowUpCoordinatorAgent`, then `ClinicalSafetyAgent`.
5. Show the provider-review indicator. Explain that the provider makes the final decision.
6. Point out that no prompt, tool payload, model response, diagnosis, or medication advice
   is displayed.
7. Open **AI Follow-up Tasks**.
8. Show the pending and in-progress synthetic tasks, status filters, and Refresh.
9. Start the pending task, then complete it; alternatively demonstrate Dismiss after a
   reset and reseed.
10. Explain clearly: the evidence was inserted by an explicit synthetic-only script and
    **no live OpenAI call occurred**.

## 5. Optional real-API verification

This check signs in through the real API and advances one pending synthetic task to
`in_progress`:

```powershell
$env:CAREPULSE_API_URL="http://127.0.0.1:8765"
python scripts/verify_provider_demo.py
```

It never prints the password, refresh token, service-role key, or access token.

## 6. Preview or reset synthetic evidence

Preview only (no deletion):

```powershell
python scripts/reset_synthetic_agent_demo.py
```

Delete only the records owned by the Phase 7 synthetic marker:

```powershell
python scripts/reset_synthetic_agent_demo.py --confirm-synthetic-reset
```

The deletion is not directly recoverable, but the seed command safely reconstructs new
synthetic demonstration records. Ordinary workflow records are never selected.
