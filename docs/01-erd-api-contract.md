# CarePulse AI — ERD & API Contract

**Status:** Draft for your approval — Phase 1, Day 3 equivalent
**Depends on:** `docs/00-scope-freeze.md`

This locks the data model and API surface before any Supabase migrations or
backend routes are written. Table names use `snake_case` to match Postgres
convention directly.

---

## 1. Entity groups

| Group | Tables | Purpose |
|---|---|---|
| Identity | `users`, `patient_profiles`, `provider_profiles` | Auth identity → role-specific profile |
| Access | `patient_provider_assignments`, `consent_records` | Who may view which patient |
| Patient tracking | `medication_schedules`, `blood_pressure_readings`, `weekly_check_ins` | Patient-entered data, stored independently of any assessment |
| Assessment | `risk_assessments`, `risk_reasons` | Rule result + AI suggestion + final level + evidence |
| Workflow | `alerts`, `follow_up_actions` | Provider review status and documented actions |
| Operations | `device_tokens`, `notification_logs`, `audit_logs` | Notifications and traceability |

## 2. Tables

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | Matches Supabase `auth.users.id` |
| email | text, unique, not null | |
| role | enum: `patient`, `provider`, `admin` | One active role per user (MVP) |
| is_active | boolean, default true | Deactivate instead of deleting |
| created_at / updated_at | timestamptz | |

### `patient_profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → users.id, unique | |
| full_name | text | |
| age | int | |
| contact_number | text | |
| created_at / updated_at | timestamptz | |

### `provider_profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → users.id, unique | |
| full_name | text | |
| role_label | text | Doctor / Nurse / Pharmacist |
| created_at / updated_at | timestamptz | |

### `patient_provider_assignments`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| patient_id | FK → patient_profiles.id | |
| provider_id | FK → provider_profiles.id | |
| is_active | boolean | Only active rows grant access |
| assigned_at / unassigned_at | timestamptz | unassigned_at nullable |

### `consent_records`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| patient_id | FK | |
| consent_version | text | |
| consented_at | timestamptz | |

### `medication_schedules`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| patient_id | FK | |
| medication_name | text | |
| dosage_description | text | |
| scheduled_time | text | e.g. "08:00, 20:00" |
| supply_status | enum: `adequate`, `low`, `out` | |
| created_at / updated_at | timestamptz | |

### `blood_pressure_readings`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| patient_id | FK | |
| systolic / diastolic | int | |
| measured_at | timestamptz | Patient-entered |
| recorded_at | timestamptz | Server timestamp — kept separate per integrity rule |
| source_check_in_id | FK → weekly_check_ins.id, nullable | Set if entered as part of a check-in |

### `weekly_check_ins`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| patient_id | FK | |
| idempotency_key | text, unique | Prevents duplicate submission on retry |
| missed_doses | boolean | |
| missed_dose_count | int, nullable | |
| medication_stopped | boolean | |
| supply_remaining | boolean | |
| difficulty_reported | boolean | |
| difficulty_text | text, nullable | Short English free text |
| requests_contact | boolean | |
| patient_submitted_at | timestamptz | Patient-entered |
| server_received_at | timestamptz | Server timestamp |

**Never overwritten** — corrections or AI reprocessing always create a new `risk_assessments` row, not a rewrite of this one.

### `risk_assessments`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| check_in_id | FK → weekly_check_ins.id | |
| rule_result_level | enum: `low`, `medium`, `high` | Safety floor |
| rule_version | text | |
| ai_suggested_level | enum, nullable | |
| ai_confidence | numeric(3,2), nullable | |
| requires_manual_review | boolean | |
| final_level | enum: `low`, `medium`, `high` | max(rule, AI) per combination rules |
| provider_summary | text, nullable | AI-generated, labeled as such in UI |
| ai_status | enum: `completed`, `pending`, `failed` | |
| model_version | text, nullable | |
| created_at | timestamptz | |

### `risk_reasons`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| risk_assessment_id | FK | |
| reason_code | enum (see §4) | |
| source | enum: `rule`, `ai` | |
| evidence_text | text, nullable | |

### `alerts`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| risk_assessment_id | FK | |
| patient_id | FK | Denormalized for fast querying |
| status | enum: `open`, `acknowledged`, `resolved` | |
| created_at | timestamptz | |
| acknowledged_at | timestamptz, nullable | |
| acknowledged_by | FK → provider_profiles.id, nullable | |

### `follow_up_actions`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| alert_id | FK | |
| provider_id | FK | |
| action_type | enum: `note`, `phone_call`, `reassignment`, `status_update` | |
| note_text | text, nullable | |
| outcome | enum: `contacted`, `unreachable`, `referred_to_doctor`, `medication_supply_issue_reported`, `other`, nullable | |
| status | enum: `needs_review`, `in_progress`, `completed` | |
| created_at | timestamptz | |

### `device_tokens`, `notification_logs`, `audit_logs`
Standard shape: `id`, `user_id` FK, timestamps, plus `audit_logs` carries `action`, `target_type`, `target_id`, and a `metadata` jsonb column. **Audit logs are insert-only from the application's perspective** — no update/delete route will ever touch them.

## 3. Relationship rules (carried from the architecture plan)

- One authenticated user has one active role for the MVP.
- Only **active** `patient_provider_assignments` rows grant provider access — history is kept, not deleted.
- A `weekly_check_ins` row stores original answers independently of any assessment; it's never overwritten.
- A `risk_assessments` row belongs to one check-in and may have multiple `risk_reasons`.
- An `alerts` row links to its triggering assessment and may have multiple `follow_up_actions`.
- All PKs are UUIDs. Idempotency keys prevent duplicate check-ins on retry. No hard deletion of clinical records — deactivate instead.

## 4. Approved reason codes (prototype list)

`MISSED_DOSES`, `MEDICATION_STOPPED`, `LOW_SUPPLY`, `SIDE_EFFECTS`, `SCHEDULE_DIFFICULTY`, `ABNORMAL_BP`, `REPEATED_NONRESPONSE`, `OTHER`

Both the rule engine and the AI adapter may only write from this fixed list — the backend rejects anything else.

## 5. Prototype risk thresholds — ⚠️ unvalidated, pending clinical sign-off

These are placeholders so development can proceed. **Do not treat as final** — flagged in the scope-freeze doc too, and needs your (or a clinician's) confirmation before any pilot use.

| Signal | Draft threshold |
|---|---|
| High | Medication stopped, OR systolic ≥180 / diastolic ≥120, OR urgent symptom flag |
| Medium | 2+ missed doses in the week, OR supply status = low/out, OR side effects reported |
| Low | No missed doses, supply adequate, no difficulty reported |

## 6. API endpoints

Auth itself is handled client-side via Supabase Auth (both apps get a session token directly from Supabase). The backend verifies that token on every request rather than issuing its own login endpoint.

| Method & path | Role | Purpose |
|---|---|---|
| `GET /me` | Any authenticated | Current user + role + profile |
| `GET/PATCH /patient/profile` | Patient | Own profile |
| `GET/POST /patient/medications` | Patient | Medication schedule |
| `GET/POST /patient/bp-readings` | Patient (write); assigned provider (read) | BP history |
| `GET/POST /patient/check-ins` | Patient (write); assigned provider (read) | **Core tracer-bullet endpoint** |
| `GET /provider/patients` | Provider, active assignment | Priority-sorted patient list, filterable |
| `GET /provider/patients/{id}` | Provider, active assignment | Focused patient record |
| `GET /provider/alerts` | Provider, active assignment | Alert queue |
| `PATCH /provider/alerts/{id}` | Provider, active assignment | Acknowledge/resolve |
| `POST /provider/patients/{id}/follow-ups` | Provider, active assignment | Record a follow-up action |
| `POST /admin/users`, `/admin/assignments` | Admin | Account + assignment management |

### `POST /patient/check-ins` — request

```json
{
  "idempotency_key": "chk_2026-08-11_9f3a",
  "missed_doses": true,
  "missed_dose_count": 3,
  "medication_stopped": false,
  "supply_remaining": true,
  "systolic": 152,
  "diastolic": 96,
  "difficulty_reported": true,
  "difficulty_text": "I forget my evening dose most days after work.",
  "requests_contact": false,
  "patient_submitted_at": "2026-08-11T14:32:00Z"
}
```

### `POST /patient/check-ins` — response (202, AI still pending)

```json
{
  "check_in_id": "8b0e...",
  "risk_assessment": {
    "rule_result_level": "medium",
    "final_level": "medium",
    "ai_status": "pending"
  },
  "message": "Check-in received. Analysis in progress."
}
```

### `GET /provider/patients` — response (excerpt)

```json
{
  "patients": [
    {
      "patient_id": "a1c4...",
      "full_name": "Nimal Perera",
      "final_risk_level": "high",
      "reason_codes": ["MEDICATION_STOPPED"],
      "last_check_in_date": "2026-08-10",
      "latest_bp": { "systolic": 178, "diastolic": 118 },
      "ai_status": "completed",
      "requires_manual_review": false
    }
  ],
  "total_high": 3,
  "total_medium": 7,
  "total_low": 14,
  "overdue_check_ins": 2
}
```

### Internal AI contract (not a public endpoint — backend-to-AI-adapter only)

```json
{
  "suggested_risk_level": "medium",
  "reason_codes": ["MISSED_DOSES", "SCHEDULE_DIFFICULTY"],
  "evidence": [
    { "reason_code": "SCHEDULE_DIFFICULTY", "text": "Patient reports work-related timing difficulty." }
  ],
  "provider_summary": "Patient reports missed doses linked to work schedule.",
  "confidence": 0.82,
  "requires_manual_review": false
}
```

The backend validates this against the reason-code list, checks length limits, strips unsupported fields, and rejects anything malformed — the rule engine's result is always the floor, regardless of what the AI returns.

## 7. Risk combination rules

| Condition | Behaviour |
|---|---|
| Rule result higher than AI suggestion | Keep the rule result — AI can never lower a safety-rule level |
| AI suggests higher risk with supported evidence | Use the higher result, show the evidence |
| AI confidence low or answers conflict | Set manual review, show original answers prominently |
| AI times out / unavailable | Store check-in + rule result; mark "AI analysis pending" |
| AI returns invalid JSON / unsupported reason code | Reject the AI payload, log it, request manual review |

## 8. Row-Level Security — direction (not final SQL yet)

- `patients` can `SELECT`/`INSERT`/`UPDATE` only rows where `patient_id` matches their own `patient_profiles.id`.
- `providers` can `SELECT` patient-linked rows only where an **active** `patient_provider_assignments` row exists for them.
- `admin` role bypasses per-row checks for account/assignment management only — never for reading clinical content.
- `audit_logs`: `INSERT` only, no `UPDATE`/`DELETE` policy exists for any role.
- Actual `CREATE POLICY` SQL gets written alongside the Supabase migrations in the next stage.

---

## Open items before this is fully "frozen"

- [ ] Confirm the prototype thresholds in §5 — even as placeholders, do these look roughly right, or wildly off?
- [ ] Confirm the reason-code list in §4 is complete enough to start with
- [ ] Anything missing from the API endpoint list for the MVP screens?
