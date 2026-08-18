/**
 * Types mirroring the actual JSON shapes returned by backend/app/api/
 * demo_patient.py. Field names intentionally match the API responses
 * (mostly snake_case, matching FastAPI's raw dict returns) rather than
 * being renamed to camelCase, so there is no silent mapping layer to
 * drift out of sync with the backend.
 */

export type RiskLevel = "low" | "medium" | "high";
export type SupplyBucket = "7+" | "3-6" | "0-2" | "none";

export const SUPPLY_LABELS: Record<SupplyBucket, string> = {
  "7+": "7 days or more",
  "3-6": "3-6 days",
  "0-2": "0-2 days",
  none: "No medicine remaining",
};

export type ReasonCode =
  | "MEDICATION_STOPPED"
  | "ABNORMAL_BP"
  | "MISSED_DOSES"
  | "LOW_SUPPLY"
  | "SCHEDULE_DIFFICULTY";

export const REASON_CODE_LABELS: Record<ReasonCode, string> = {
  MEDICATION_STOPPED: "Medication stopped",
  ABNORMAL_BP: "Elevated BP recorded",
  MISSED_DOSES: "Multiple missed doses",
  LOW_SUPPLY: "Medicine supply low or depleted",
  SCHEDULE_DIFFICULTY: "Treatment difficulty reported",
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
  age: number;
}

export interface ApiMedication {
  id: string;
  patient_id: string;
  name: string;
  instructions: string;
  scheduled_time: string;
  reminder_on: number; // sqlite boolean (0/1)
}

export interface ApiBPReading {
  id: string;
  patient_id: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  measured_at: string;
  notes: string | null;
}

export interface ApiCheckIn {
  id: string;
  patient_id: string;
  missed_doses: number;
  missed_dose_count: number | null;
  medication_stopped: number;
  supply_bucket: SupplyBucket;
  supply_remaining: number;
  systolic: number | null;
  diastolic: number | null;
  difficulty_reported: number;
  difficulty_text: string | null;
  patient_submitted_at: string;
  risk_level: RiskLevel;
  reason_codes: ReasonCode[];
  rule_version: string;
  summary: string;
}

export interface ApiHome {
  patient: { id: string; name: string; age: number };
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
  patientId: string;
  name: string;
  email: string;
}
