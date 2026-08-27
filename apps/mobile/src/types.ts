/**
 * View-model types for the mobile app, mapped from the real production
 * API's JSON shapes (backend/app/api/patient.py, checkins.py, auth.py) —
 * this app no longer talks to backend/app/api/demo_patient.py's SQLite-
 * backed /demo/* routes. Mapping from the raw snake_case API responses to
 * these types happens entirely inside api/client.ts, mirroring the same
 * pattern apps/web/src/lib/providerApi.ts already uses for the provider
 * dashboard.
 *
 * Two things are deliberately different from the old demo-mode shapes:
 *  - Real booleans throughout (no more SQLite 0/1 integers).
 *  - Reason codes, AI evidence, and the AI-generated provider summary are
 *    NEVER sent to the patient by the production API (see patient.py's
 *    "no clinical content on the patient confirmation/history screens"
 *    rule) — only the calculated risk level is. Screens that used to show
 *    reason codes/summary to the patient have been adjusted accordingly.
 */

export type RiskLevel = "low" | "medium" | "high";
export type SupplyBucket = "7+" | "3-6" | "0-2" | "none";

export const SUPPLY_LABELS: Record<SupplyBucket, string> = {
  "7+": "7 days or more",
  "3-6": "3-6 days",
  "0-2": "0-2 days",
  none: "No medicine remaining",
};

export const DIFFICULTY_OPTIONS = [
  "Forgetfulness",
  "Side effects",
  "Medicine unavailable",
  "Work or travel schedule",
  "Cost",
  "Difficulty visiting the clinic",
  "Unclear instructions",
  "Other",
] as const;

export interface ApiPatient {
  id: string;
  name: string;
  email: string;
  age: number | null;
}

export interface ApiMedication {
  id: string;
  name: string;
  instructions: string;
  scheduled_time: string | null;
  supply_status: string;
  reminder_enabled: boolean;
}

export interface ApiBPReading {
  id: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  notes: string | null;
  measured_at: string;
}

export interface ApiRiskAssessmentSummary {
  rule_result_level: RiskLevel;
  final_level: RiskLevel;
  ai_status: string;
}

export interface ApiCheckIn {
  id: string;
  missed_doses: boolean;
  missed_dose_count: number | null;
  medication_stopped: boolean;
  supply_remaining: boolean;
  difficulty_reported: boolean;
  difficulty_text: string | null;
  patient_submitted_at: string;
  server_received_at: string;
  risk_level: RiskLevel | null;
  /**
   * AI-generated summary of this check-in. Shown to the patient on the
   * Check-in Submitted / History screens when risk_level is medium/high
   * — a deliberate 2026-08-22 policy change (see backend/app/models/
   * checkins.py's RiskAssessmentSummary docstring for the full history);
   * this used to be provider-only.
   */
  provider_summary: string | null;
}

export interface ApiHome {
  patient: { name: string };
  nextMedication: ApiMedication | null;
  latestCheckIn: ApiCheckIn | null;
  latestBP: ApiBPReading | null;
}

export interface ApiHistory {
  checkIns: ApiCheckIn[];
  bpReadings: ApiBPReading[];
}

/** Draft answers for the in-progress 3-step weekly check-in wizard. */
export interface CheckInDraft {
  missedDoses: boolean | null;
  missedDoseCount: number | null;
  medicationStopped: boolean | null;
  supplyBucket: SupplyBucket | null;
  sideEffectsReported: boolean | null;
  difficultyReasons: string[];
  additionalDetails: string;
}

export const EMPTY_CHECKIN_DRAFT: CheckInDraft = {
  missedDoses: null,
  missedDoseCount: null,
  medicationStopped: null,
  supplyBucket: null,
  sideEffectsReported: null,
  difficultyReasons: [],
  additionalDetails: "",
};

export interface PatientSession {
  accessToken: string;
  refreshToken: string;
  patientId: string;
  name: string;
  email: string;
}
