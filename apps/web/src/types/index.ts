/**
 * Provider-dashboard view models plus exact Phase 5 agent-workflow API
 * response types. The existing dashboard view models remain camelCase;
 * providerApi.ts owns the explicit mapping from the production FastAPI
 * snake_case responses.
 */

export type RiskLevel = "low" | "medium" | "high" | "pending";

// Matches backend/supabase/migrations' `reason_code` enum exactly (8
// values) — this used to list only 5, silently dropping any check-in
// whose AI- or rule-derived reason was SIDE_EFFECTS, REPEATED_NONRESPONSE,
// or OTHER from both the Risk Assessment Review chips and the reason-code
// fallback text (caught via a live API check, not just typechecking).
export type ReasonCode =
  | "MEDICATION_STOPPED"
  | "ABNORMAL_BP"
  | "MISSED_DOSES"
  | "LOW_SUPPLY"
  | "SIDE_EFFECTS"
  | "SCHEDULE_DIFFICULTY"
  | "REPEATED_NONRESPONSE"
  | "OTHER";

export const REASON_CODE_LABELS: Record<ReasonCode, string> = {
  MEDICATION_STOPPED: "Medication stopped",
  ABNORMAL_BP: "Elevated BP recorded",
  MISSED_DOSES: "Multiple missed doses",
  LOW_SUPPLY: "Medicine supply low or depleted",
  SIDE_EFFECTS: "Side effects reported",
  SCHEDULE_DIFFICULTY: "Treatment difficulty reported",
  REPEATED_NONRESPONSE: "Repeated non-response to outreach",
  OTHER: "Other concern flagged",
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
  condition: string | null;
  clinic: string | null;
  enrolledAt: string | null;
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
  missed_doses: boolean;
  missed_dose_count: number | null;
  medication_stopped: boolean;
  supply_bucket: string;
  supply_remaining: boolean;
  systolic: number | null;
  diastolic: number | null;
  difficulty_reported: number;
  difficulty_text: string | null;
  side_effects_reported: number;
  side_effects_text: string | null;
  patient_submitted_at: string;
  risk_level: "low" | "medium" | "high";
  reason_codes: ReasonCode[];
  rule_version: string;
  summary: string;
}

export const CONTACT_METHODS = [
  "Phone",
  "Message",
  "Clinic Visit",
  "Caregiver Contact",
  "Unable to Reach",
  "Other",
] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

// Matches backend/app/models/provider.py's FollowUpOutcome enum exactly —
// these are the only five values the database column accepts.
export type FollowUpOutcome =
  | "contacted"
  | "unreachable"
  | "referred_to_doctor"
  | "medication_supply_issue_reported"
  | "other";

export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  contacted: "Patient contacted — adherence advice given",
  unreachable: "Unable to reach patient",
  referred_to_doctor: "Referred to doctor",
  medication_supply_issue_reported: "Medication supply issue reported",
  other: "Other",
};

export const ALERT_STATUSES = ["New", "In Progress", "Follow-up Recorded", "Resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface ApiFollowUp {
  id: string;
  patient_id: string;
  provider_id: string;
  provider_full_name: string | null;
  contact_method: ContactMethod;
  notes: string | null;
  next_advice: string | null;
  alert_status: AlertStatus;
  contacted_person: string | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  assigned_to_provider_id: string | null;
  assigned_to_provider_name: string | null;
  notify_patient: boolean;
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
  checkInsThisWeek: number;
  recentAlerts: {
    patientId: string;
    patientName: string;
    riskLevel: RiskLevel;
    mainReason: string;
    date: string;
  }[];
}

export interface ApiOpenAlert {
  id: string;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
}

export interface PatientDetail {
  patient: ApiPatient;
  medications: ApiMedication[];
  latestCheckIn: ApiCheckIn | null;
  latestBP: ApiBPReading | null;
  riskLevel: RiskLevel;
  /** The deterministic rule engine's own result, before any AI raise. */
  ruleResultLevel: RiskLevel | null;
  /** What the AI suggested, independent of the rule floor and the combined final_level. */
  aiSuggestedLevel: RiskLevel | null;
  aiConfidence: number | null;
  /** id of the latest risk_assessments row — needed to submit feedback on it. */
  assessmentId: string | null;
  /** When the latest risk assessment was generated (rule/AI run time), for the Risk Assessment Review screen's "Model information" block. */
  assessmentCreatedAt: string | null;
  /** Which AI model produced ai_suggested_level, if any — null when the assessment is rule-only. */
  modelVersion: string | null;
  feedback: "helpful" | "not_helpful" | "reported" | null;
  /** Set once a provider has overridden the level shown above, with a required reason. */
  providerOverrideLevel: "low" | "medium" | "high" | null;
  providerOverrideAt: string | null;
  providerOverrideReason: string | null;
  followUps: ApiFollowUp[];
  openAlerts: ApiOpenAlert[];
  /** The provider currently assigned to this patient — Patient Record's header. */
  assignedProviderName: string | null;
}

export interface ProviderProfile {
  id: string;
  name: string;
  email: string;
  clinic: string;
}

export interface ProviderSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  provider: ProviderProfile;
}

export type AgentRunStatus = "running" | "completed" | "failed" | "manual_review";
export type AgentActionStatus = "success" | "failed" | "skipped";
export type AgentName =
  | "CheckInAnalysisAgent"
  | "FollowUpCoordinatorAgent"
  | "ClinicalSafetyAgent";

export interface AgentActionSummary {
  id: string;
  agent_name: AgentName;
  action_type: string;
  status: AgentActionStatus;
  requires_provider_approval: boolean;
  created_at: string;
}

export interface AgentRun {
  id: string;
  check_in_id: string;
  patient_id: string;
  status: AgentRunStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  actions: AgentActionSummary[];
}

export type FollowUpTaskStatus = "pending" | "in_progress" | "completed" | "dismissed";
export type FollowUpTaskType =
  | "nurse_review"
  | "pharmacist_review"
  | "doctor_review"
  | "reminder"
  | "other";
export type FollowUpTaskPriority = "low" | "medium" | "high";

export interface FollowUpTask {
  id: string;
  patient_id: string;
  agent_run_id: string;
  task_type: FollowUpTaskType;
  priority: FollowUpTaskPriority;
  rationale: string;
  status: FollowUpTaskStatus;
  provider_id: string | null;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Compatibility types for the isolated local prototype helpers that remain
 * in src/lib. Production provider pages use the API-backed view models above.
 */
export interface CheckInInput {
  medicationStopped: boolean;
  missedDoseCount: number | null;
  supplyRemainingDays: number | null;
  systolic: number | null;
  diastolic: number | null;
  difficultyReported: boolean;
  difficultyText: string | null;
}

export interface CheckIn extends CheckInInput {
  id: string;
  patientId: string;
  patientSubmittedAt: string;
}

export interface FollowUpAction {
  id: string;
  patientId: string;
}

export interface Patient {
  id: string;
}
