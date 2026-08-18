/**
 * Types mirroring the JSON shapes returned by backend/app/api/
 * demo_provider.py and demo_patient.py. Field names intentionally match
 * the API responses (mostly snake_case for raw passthrough fields from
 * FastAPI's dict returns) rather than being renamed, so there's no
 * silent mapping layer to drift out of sync with the backend.
 */

export type RiskLevel = "low" | "medium" | "high" | "pending";

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

export const SUPPLY_LABELS: Record<string, string> = {
  "7+": "7 days or more",
  "3-6": "3-6 days",
  "0-2": "0-2 days",
  none: "No medicine remaining",
};

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
  reminder_on: number;
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
  supply_bucket: string;
  supply_remaining: number;
  systolic: number | null;
  diastolic: number | null;
  difficulty_reported: number;
  difficulty_text: string | null;
  patient_submitted_at: string;
  risk_level: "low" | "medium" | "high";
  reason_codes: ReasonCode[];
  rule_version: string;
  summary: string;
}

export const CONTACT_METHODS = ["Phone", "Message", "Clinic Visit", "Unable to Reach", "Other"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const ALERT_STATUSES = ["New", "In Progress", "Follow-up Recorded", "Resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface ApiFollowUp {
  id: string;
  patient_id: string;
  provider_id: string;
  contact_method: ContactMethod;
  notes: string | null;
  next_action: string | null;
  alert_status: AlertStatus;
  next_action_date: string | null;
  created_at: string;
}

export interface QueueRow {
  id: string;
  name: string;
  age: number;
  latestBP: string | null;
  missedDoses: number | null;
  supplyBucket: string | null;
  riskLevel: RiskLevel;
  mainReason: string;
  lastCheckInDate: string | null;
  alertStatus: AlertStatus;
}

export interface DashboardSummary {
  totalPatients: number;
  highRisk: number;
  mediumRisk: number;
  pendingReview: number;
  checkInsReceived: number;
  recentAlerts: {
    patientId: string;
    patientName: string;
    riskLevel: RiskLevel;
    mainReason: string;
    date: string;
  }[];
}

export interface PatientDetail {
  patient: ApiPatient;
  medications: ApiMedication[];
  latestCheckIn: ApiCheckIn | null;
  latestBP: ApiBPReading | null;
  riskLevel: RiskLevel;
  followUps: ApiFollowUp[];
}

export interface ProviderProfile {
  id: string;
  name: string;
  email: string;
  clinic: string;
}

export interface ProviderSession {
  accessToken: string;
  provider: ProviderProfile;
}
