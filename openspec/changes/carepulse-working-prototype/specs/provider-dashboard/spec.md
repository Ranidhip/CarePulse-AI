## ADDED Requirements

### Requirement: Dashboard Overview
The system SHALL show total patients, high-priority patient count, patients
needing follow-up, check-ins received, and recent alerts to a provider.

#### Scenario: Overview reflects live data
- **WHEN** a provider opens the dashboard
- **THEN** the counts shown match the current stored patients and check-ins,
  not static placeholder numbers

### Requirement: Patient Priority Queue
The system SHALL list patients with name, age, latest BP, missed doses,
medicine supply, risk level, main flag reason, and last check-in date, and
SHALL support filtering by All/High/Medium/Low with high-risk patients
sorted first.

#### Scenario: New check-in appears in queue
- **WHEN** a patient submits a weekly check-in
- **THEN** that patient appears (or updates) in the provider's priority
  queue without requiring a manual refresh trigger beyond reloading the
  queue view

#### Scenario: Filter by risk level
- **WHEN** a provider selects the "High" filter
- **THEN** only patients currently at High (or Critical/Urgent) risk are
  shown, sorted highest-risk first

### Requirement: Patient Detail View
The system SHALL show a patient's profile, medication schedule, latest
adherence data, latest BP, current risk badge, risk reason codes, a
generated clinical summary, and prior follow-up actions.

#### Scenario: Reasons match rule engine output
- **WHEN** a provider opens a patient flagged High risk
- **THEN** the displayed reason codes match what the deterministic rule
  engine returned for that check-in, unmodified

#### Scenario: Route hides existence of unassigned patients
- **WHEN** a provider requests a patient detail for a patient with no
  active assignment to them
- **THEN** the system returns 404, not 403

### Requirement: Clinical Summary Generation
The system SHALL generate a short summary describing only submitted facts,
using a real AI call when available and a deterministic fallback otherwise,
and SHALL NOT diagnose, prescribe, or recommend dosage changes.

#### Scenario: Fallback summary used when AI unavailable
- **WHEN** the AI service call fails or no key is configured
- **THEN** a deterministic fallback summary is shown, labelled "Prototype-
  generated summary"

### Requirement: Follow-Up Action Recording
The system SHALL let a provider record a follow-up action (type: Phone
call, Nurse review, Pharmacist review, Doctor review, or General reminder;
notes; status: Pending/Contacted/Completed), and SHALL persist it so it
appears in the patient's follow-up history after a page refresh.

#### Scenario: Saved follow-up persists after refresh
- **WHEN** a provider saves a follow-up action and then refreshes the page
- **THEN** the action is still present in that patient's follow-up history
