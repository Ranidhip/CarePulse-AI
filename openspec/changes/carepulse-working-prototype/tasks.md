# Tasks: CarePulse Working Prototype (Web)

## Backend (reuse existing auth + rule engine — no rework)
- [ ] Fix Supabase seeding blocker (switch to legacy `eyJA...` service_role JWT)
- [ ] Seed 6 fictional demo patients across risk levels
- [ ] `GET /provider/patients` — priority queue, reuses `require_provider`
- [ ] `GET /provider/patients/{id}` — detail, 404 if no active assignment
- [ ] `POST /provider/patients/{id}/follow-up` — save follow-up action
- [ ] `app/services/ai/summary.py` — deterministic fallback + optional real
      OpenAI call, isolated service function, labelled output

## Frontend — apps/web (patient, mobile-responsive)
- [ ] Role-select screen (Continue as Patient / Continue as Provider)
- [ ] Patient dashboard (name, next med time, schedule, latest check-in,
      latest BP, "Complete Weekly Check-in" button)
- [ ] Weekly check-in form with validation
- [ ] Submission confirmation (risk level + safety disclaimer)

## Frontend — apps/web (provider, desktop)
- [ ] Sidebar navigation
- [ ] Dashboard overview (counts, recent alerts)
- [ ] Priority queue (filter All/High/Medium/Low, sorted high-first)
- [ ] Patient detail (profile, adherence, BP, risk badge + reasons,
      AI/deterministic summary, follow-up history)
- [ ] Follow-up action form

## Cross-cutting
- [ ] Shared TypeScript types (`packages/shared-types`) for check-in,
      risk assessment, follow-up action
- [ ] "Reset Demo Data" control
- [ ] Manual end-to-end test: patient submits -> appears in queue ->
      provider opens detail -> saves follow-up -> refresh persists
- [ ] README: setup, demo script, limitations
