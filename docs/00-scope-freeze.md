# CarePulse AI — Scope Freeze / Approved MVP Checklist

**Status:** Draft for your approval — Phase 1, Day 1 (Tue 4 Aug equivalent)
**Build window:** 4–25 Aug 2026

This document locks what ships in the MVP so every later decision (API design, DB schema, UI build) has a fixed reference. Once you approve it, it becomes the source of truth for scope disputes during the build.

---

## 1. Roles

| Role | Interface | Responsibility |
|---|---|---|
| Patient | Expo mobile app | Profile, medication schedule, weekly check-in, BP entry (optional), history |
| Healthcare provider | React web dashboard | Review assigned patients, risk evidence, follow-up documentation |
| Administrator | Minimal React web area | Account activation, provider-patient assignments |

One active role per authenticated user for the MVP.

## 2. P0 / P1 / P2 / P3 priority lock

**P0 — the tracer bullet (must work, protects patient submissions from loss)**
- Patient submits weekly check-in → stored before AI runs → deterministic risk rule applied → AI adds evidence/summary → appears in provider queue → provider records follow-up

**P1 — complete around the tracer bullet**
- Authentication (patient, provider, admin)
- Provider patient records (profile, medication, BP/check-in history)
- AI output validation and manual-review fallback
- Priority explanations (reason codes shown to provider)
- Follow-up workflow (notes, contact outcome, status)

**P2 — if time allows after P0/P1**
- Local reminders, history views, filters, evaluation evidence, visual polish

**P3 — only if time remains**
- Charts/analytics, server push notifications, extra record fields

## 3. Explicit exclusions (confirmed out of MVP)

- Diagnosis, emergency triage, treatment/dosage decisions
- Bluetooth BP device integration
- Hospital EHR, prescriptions, pharmacy dispensing
- WhatsApp, SMS, voice interaction, caregiver accounts
- Sinhala/Tamil interfaces (English-only for v1)
- iOS release (Android demo build only)
- Any claim of clinical validation

## 4. Allowed patient/health-record fields

Minimum-necessary set — nothing beyond this list is collected in the MVP:

- Patient ID, full name, age, contact number
- Assigned healthcare provider
- Medication schedule (name, dosage description, scheduled time, supply status)
- Weekly check-in: missed doses (yes/no + count), medication stopped (yes/no), supply remaining (yes/no), latest systolic/diastolic BP, treatment difficulty (yes/no + short English free text), request-contact flag
- Last check-in date, latest BP reading, current risk level (derived, not entered)

No diagnoses, no free-text medical history, no identifiers beyond what's listed here.

## 5. Non-negotiable safety boundary

- AI never diagnoses, never recommends medication/dosage, never lowers a rule-derived risk level
- Deterministic rules are the safety floor; AI can only add evidence or raise risk with justification
- Original patient answers are always stored and shown — never replaced or hidden by an AI summary
- AI failure/timeout/invalid output → check-in still saves, provider sees "AI analysis pending" or "manual review required"
- All thresholds are prototype values pending clinical sign-off — flagged as such everywhere they appear

## 6. Acceptance criteria (minimum demonstration scenario)

1. Admin creates a patient and assigns a provider
2. Patient logs in, records medication + BP, submits a weekly check-in with one structured difficulty and short free text
3. Backend stores the original submission, applies the rule engine, gets an AI response (or stub)
4. Provider dashboard shows the patient with reasons, original answers, and a labeled AI summary
5. Provider records a follow-up action and updates alert status
6. History and audit records show the full traceable journey

---

## Open items before this can be fully "frozen"

- [ ] Confirm the P0/P1/P2/P3 split above matches your intent
- [ ] Confirm the allowed-fields list — anything missing or to remove?
- [ ] Clinical thresholds (BP cutoffs, missed-dose counts) are **not yet defined** — placeholders come next in the ERD/rule-table step, clearly marked unvalidated
