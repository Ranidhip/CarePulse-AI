## ADDED Requirements

### Requirement: Role Selection
The system SHALL let a user choose to continue as a Patient or as a
Healthcare Provider, with no production authentication required for this
prototype.

#### Scenario: User selects patient role
- **WHEN** a user opens the app and taps "Continue as Patient"
- **THEN** they are taken to the patient dashboard for the demo patient
  identity

### Requirement: Patient Dashboard
The system SHALL show the patient's name, next medication time, medication
schedule, latest check-in status, and latest blood-pressure reading.

#### Scenario: Dashboard reflects most recent check-in
- **WHEN** a patient has previously submitted a check-in
- **THEN** the dashboard displays the BP and status from that submission,
  not placeholder data

### Requirement: Weekly Check-In Form
The system SHALL collect missed-medication status, missed-dose count,
medication-stopped status, remaining supply in days, systolic/diastolic BP,
and a free-text treatment difficulty field, and SHALL validate required
fields before allowing submission.

#### Scenario: Incomplete form blocked from submission
- **WHEN** a patient leaves a required field empty and taps Submit
- **THEN** the system shows a validation error and does not submit

#### Scenario: Valid check-in submitted
- **WHEN** a patient completes all required fields with valid values and
  taps Submit
- **THEN** the check-in is sent to `POST /patient/check-ins`, stored
  unmodified, and a risk assessment is returned

### Requirement: Submission Confirmation
The system SHALL confirm the check-in was saved, show the calculated risk
level, and display a clear message that the system does not provide medical
advice.

#### Scenario: Confirmation shown after submit
- **WHEN** a check-in submission succeeds
- **THEN** the patient sees the saved confirmation, the risk level, the
  non-medical-advice disclaimer, and a button back to the dashboard
