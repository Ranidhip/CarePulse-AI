/**
 * Authenticated production API client for the provider dashboard.
 *
 * This is the only frontend module that knows the FastAPI base URL or
 * attaches a bearer token. Supabase service-role and OpenAI keys remain
 * backend-only. Existing dashboard view models are mapped explicitly
 * from the production API's snake_case responses.
 */

import type {
  AgentRun,
  AlertStatus,
  ApiCheckIn,
  ApiFollowUp,
  ApiMedication,
  ContactMethod,
  DashboardSummary,
  FollowUpOutcome,
  FollowUpTask,
  FollowUpTaskStatus,
  PatientDetail,
  ProviderProfile,
  QueueRow,
  ReasonCode,
  RiskLevel,
} from "../types";
import { REASON_CODE_LABELS } from "../types";
import { expireProviderSession, getProviderSession } from "./providerSessionStore";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function assertConfigured(): string {
  if (!API_URL) {
    throw new Error(
      "VITE_API_URL is not set. Create apps/web/.env with " +
        "VITE_API_URL=http://localhost:8000 and restart Vite.",
    );
  }
  return API_URL.replace(/\/$/, "");
}

async function errorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

function publicErrorMessage(
  status: number,
  detail: string | null,
  authenticatedRequest: boolean,
): string {
  if (status === 401) {
    return authenticatedRequest
      ? "Your session has expired. Please sign in again."
      : "Invalid email or password.";
  }
  if (status === 403) return "Your account is not allowed to perform this action.";
  if (status === 404) return "The requested patient or task was not found.";
  if (status === 409) return "This task changed elsewhere. Refresh and try again.";
  if (status === 422) return detail ?? "The requested update is not valid.";
  return "The backend could not complete this request. Please try again.";
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const base = assertConfigured();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (options.auth !== false) {
    const session = getProviderSession();
    if (!session) {
      throw new ApiError(401, "Your session has expired. Please sign in again.");
    }
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${base}. Make sure the FastAPI server is running.`,
    );
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
    if (response.status === 401 && options.auth !== false) expireProviderSession();
    throw new ApiError(
      response.status,
      publicErrorMessage(response.status, detail, options.auth !== false),
    );
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

interface SessionResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user: { id: string; email: string; role: string; is_active: boolean };
}

interface RawDashboardSummary {
  total_patients: number;
  high_risk: number;
  medium_risk: number;
  pending_review: number;
  low_risk: number;
  check_ins_received: number;
  check_ins_this_week: number;
}

interface RawQueueRow {
  patient_id: string;
  full_name: string;
  age: number | null;
  tier: RiskLevel;
  final_level: string | null;
  reason_codes: string[];
  requires_manual_review: boolean;
  latest_bp: string | null;
  last_check_in_at: string | null;
  alert_status: "open" | "acknowledged" | "resolved" | null;
}

interface RawMedication {
  id: string;
  medication_name: string;
  dosage_description: string | null;
  scheduled_time: string | null;
  supply_status: string;
  reminder_enabled: boolean;
}

interface RawBPReading {
  id: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  notes: string | null;
  measured_at: string;
  recorded_at: string;
}

interface RawCheckIn {
  id: string;
  missed_doses: boolean;
  missed_dose_count: number | null;
  medication_stopped: boolean;
  supply_remaining: boolean;
  difficulty_reported: boolean;
  difficulty_text: string | null;
  side_effects_reported: boolean;
  side_effects_text: string | null;
  requests_contact: boolean;
  patient_submitted_at: string;
  server_received_at: string;
}

interface RawAssessment {
  id: string;
  rule_result_level: string;
  ai_suggested_level: string | null;
  ai_confidence: number | null;
  final_level: "low" | "medium" | "high";
  ai_status: string;
  requires_manual_review: boolean;
  provider_summary: string | null;
  model_version: string | null;
  created_at: string;
  reasons: { reason_code: string; source: string; evidence_text: string | null }[];
  feedback: "helpful" | "not_helpful" | "reported" | null;
  provider_override_level: "low" | "medium" | "high" | null;
  provider_override_at: string | null;
  provider_override_reason: string | null;
}

interface RawAlert {
  id: string;
  patient_id: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
}

export interface BPTrendPoint {
  id: string;
  systolic: number;
  diastolic: number;
  measuredAt: string;
}

export interface TimelineEntry {
  entry_type: "check_in" | "alert" | "follow_up";
  occurred_at: string;
  summary: string;
  data: Record<string, unknown>;
}

interface RawFollowUpAction {
  id: string;
  alert_id: string;
  provider_id: string;
  provider_full_name: string | null;
  action_type: "note" | "phone_call" | "reassignment" | "status_update";
  note_text: string | null;
  next_advice: string | null;
  outcome: string | null;
  status: "needs_review" | "in_progress" | "completed";
  contacted_person: string | null;
  follow_up_date: string | null;
  follow_up_time: string | null;
  assigned_to_provider_id: string | null;
  assigned_to_provider_name: string | null;
  notify_patient: boolean;
  next_action_date: string | null;
  created_at: string;
}

interface RawPatientDetail {
  profile: {
    id: string;
    full_name: string;
    age: number | null;
    contact_number: string | null;
    condition: string | null;
    clinic: string | null;
    enrolled_at: string | null;
  };
  medications: RawMedication[];
  latest_bp: RawBPReading | null;
  latest_check_in: { check_in: RawCheckIn; assessment: RawAssessment | null } | null;
  open_alerts: RawAlert[];
  follow_ups: RawFollowUpAction[];
  assigned_provider_name: string | null;
}

// Was a second, independently-drifted copy of REASON_CODE_LABELS (with
// only 5 of the 8 real reason codes) — reusing the one source of truth
// from ../types instead, so this can't silently go stale again the way
// it did here (caught via a live API check, not typechecking).
const REASON_LABELS: Record<string, string> = REASON_CODE_LABELS;

function providerFromSession(session: SessionResponse): ProviderProfile {
  const localName = session.user.email.split("@")[0].replace(/[._-]+/g, " ");
  return {
    id: session.user.id,
    name: localName.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    email: session.user.email,
    clinic: "CarePulse Provider",
  };
}

function mapAlertStatus(status: RawQueueRow["alert_status"]): AlertStatus {
  if (status === "resolved") return "Resolved";
  if (status === "acknowledged") return "In Progress";
  return "New";
}

function mapQueueRow(row: RawQueueRow): QueueRow {
  return {
    id: row.patient_id,
    name: row.full_name,
    age: row.age ?? 0,
    latestBP: row.latest_bp,
    missedDoses: null,
    supplyBucket: null,
    riskLevel: row.tier,
    mainReason:
      row.reason_codes.map((code) => REASON_LABELS[code] ?? code).join(", ") ||
      (row.requires_manual_review ? "Manual review required" : "No priority reason"),
    lastCheckInDate: row.last_check_in_at,
    alertStatus: mapAlertStatus(row.alert_status),
  };
}

// Follow-ups recorded before supabase/migrations/20260827111500_follow_up_
// action_fields.sql have next_advice = null on the real column, with the
// advice text still embedded in note_text behind a "\nNext advice: "
// marker (or the older "\nNext action: " wording it replaced) — the only
// way this app had to carry two form fields through one database column
// at the time. New writes go straight to the next_advice column and never
// produce this marker (see createFollowUp below), so this is a read-path
// fallback for old rows only, not something new data needs.
const NEXT_ADVICE_PREFIX = "\nNext advice: ";
const LEGACY_NEXT_ACTION_PREFIX = "\nNext action: ";

function splitLegacyNoteText(noteText: string | null): { notes: string | null; nextAdvice: string | null } {
  if (!noteText) return { notes: noteText, nextAdvice: null };
  const idx = noteText.indexOf(NEXT_ADVICE_PREFIX);
  if (idx !== -1) {
    return {
      notes: noteText.slice(0, idx) || null,
      nextAdvice: noteText.slice(idx + NEXT_ADVICE_PREFIX.length) || null,
    };
  }
  const legacyIdx = noteText.indexOf(LEGACY_NEXT_ACTION_PREFIX);
  if (legacyIdx !== -1) {
    return {
      notes: noteText.slice(0, legacyIdx) || null,
      nextAdvice: noteText.slice(legacyIdx + LEGACY_NEXT_ACTION_PREFIX.length) || null,
    };
  }
  return { notes: noteText, nextAdvice: null };
}

function mapFollowUp(row: RawFollowUpAction, patientId: string): ApiFollowUp {
  // row.next_advice being non-null means this row was written after the
  // dedicated column existed, so note_text is trusted as-is. Only fall
  // back to marker-splitting when the column is empty, which is true for
  // every pre-migration row (and also, harmlessly, for a post-migration
  // row where the provider genuinely left "next advice" blank).
  const { notes, nextAdvice } =
    row.next_advice != null
      ? { notes: row.note_text, nextAdvice: row.next_advice }
      : splitLegacyNoteText(row.note_text);
  return {
    id: row.id,
    patient_id: patientId,
    provider_id: row.provider_id,
    provider_full_name: row.provider_full_name,
    contact_method: row.action_type === "phone_call" ? "Phone" : "Other",
    notes,
    next_advice: nextAdvice,
    alert_status:
      row.status === "completed"
        ? "Resolved"
        : row.status === "in_progress"
          ? "In Progress"
          : "Follow-up Recorded",
    contacted_person: row.contacted_person,
    follow_up_date: row.follow_up_date,
    follow_up_time: row.follow_up_time,
    assigned_to_provider_id: row.assigned_to_provider_id,
    assigned_to_provider_name: row.assigned_to_provider_name,
    notify_patient: row.notify_patient,
    next_action_date: row.next_action_date,
    created_at: row.created_at,
  };
}

function asRiskLevel(value: string | null | undefined): RiskLevel | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function mapPatientDetail(raw: RawPatientDetail): PatientDetail {
  const assessment = raw.latest_check_in?.assessment ?? null;
  const checkIn = raw.latest_check_in?.check_in ?? null;
  // The same reason_code can appear twice in assessment.reasons — once
  // from the rule engine (source: "rule"), once from the AI adapter
  // reaching the same conclusion (source: "ai"). Real, not a backend
  // bug: it preserves provenance. Every screen that renders this list
  // (Risk Assessment Review's chips, Patient Record's alert summary)
  // only ever shows the label, never the source, so a duplicate label is
  // pure visual noise (and was throwing a React duplicate-key warning on
  // the chip list) — dedupe once here, centrally, rather than in every
  // page that reads reason_codes.
  const reasonCodes = [
    ...new Set(
      (assessment?.reasons ?? [])
        .map((reason) => reason.reason_code)
        .filter((code): code is ReasonCode => code in REASON_LABELS),
    ),
  ];

  let mappedCheckIn: ApiCheckIn | null = null;
  if (checkIn) {
    mappedCheckIn = {
      id: checkIn.id,
      patient_id: raw.profile.id,
      missed_doses: checkIn.missed_doses,
      missed_dose_count: checkIn.missed_dose_count,
      medication_stopped: checkIn.medication_stopped,
      supply_bucket: checkIn.supply_remaining ? "7+" : "none",
      supply_remaining: checkIn.supply_remaining,
      systolic: raw.latest_bp?.systolic ?? null,
      diastolic: raw.latest_bp?.diastolic ?? null,
      difficulty_reported: checkIn.difficulty_reported ? 1 : 0,
      difficulty_text: checkIn.difficulty_text,
      side_effects_reported: checkIn.side_effects_reported ? 1 : 0,
      side_effects_text: checkIn.side_effects_text,
      patient_submitted_at: checkIn.patient_submitted_at,
      risk_level: assessment?.provider_override_level ?? assessment?.final_level ?? "low",
      reason_codes: reasonCodes,
      rule_version: "backend-authoritative",
      summary: assessment?.provider_summary ?? "No AI summary available.",
    };
  }

  const medications: ApiMedication[] = raw.medications.map((medication) => ({
    id: medication.id,
    patient_id: raw.profile.id,
    name: medication.medication_name,
    instructions: medication.dosage_description ?? "No dosage description recorded",
    scheduled_time: medication.scheduled_time ?? "Not scheduled",
    reminder_on: medication.reminder_enabled ? 1 : 0,
  }));

  return {
    patient: {
      id: raw.profile.id,
      name: raw.profile.full_name,
      email: raw.profile.contact_number ?? "Contact not provided",
      age: raw.profile.age ?? 0,
      condition: raw.profile.condition,
      clinic: raw.profile.clinic,
      enrolledAt: raw.profile.enrolled_at,
    },
    medications,
    latestCheckIn: mappedCheckIn,
    latestBP: raw.latest_bp
      ? {
          ...raw.latest_bp,
          patient_id: raw.profile.id,
        }
      : null,
    riskLevel: assessment?.provider_override_level ?? assessment?.final_level ?? "pending",
    ruleResultLevel: asRiskLevel(assessment?.rule_result_level),
    aiSuggestedLevel: asRiskLevel(assessment?.ai_suggested_level),
    aiConfidence: assessment?.ai_confidence ?? null,
    assessmentId: assessment?.id ?? null,
    assessmentCreatedAt: assessment?.created_at ?? null,
    modelVersion: assessment?.model_version ?? null,
    feedback: assessment?.feedback ?? null,
    providerOverrideLevel: assessment?.provider_override_level ?? null,
    providerOverrideAt: assessment?.provider_override_at ?? null,
    providerOverrideReason: assessment?.provider_override_reason ?? null,
    followUps: raw.follow_ups.map((followUp) => mapFollowUp(followUp, raw.profile.id)),
    openAlerts: raw.open_alerts.map((alert) => ({
      id: alert.id,
      status: alert.status,
      createdAt: alert.created_at,
    })),
    assignedProviderName: raw.assigned_provider_name,
  };
}

function actionTypeFor(contactMethod: ContactMethod): RawFollowUpAction["action_type"] {
  return contactMethod === "Phone" ? "phone_call" : "note";
}

function followUpStatusFor(status: AlertStatus): RawFollowUpAction["status"] {
  if (status === "Resolved") return "completed";
  if (status === "In Progress") return "in_progress";
  return "needs_review";
}

// alerts.status only has three values, but the follow-up form's "Alert
// status" dropdown has four (matching the mockup) — "Follow-up Recorded"
// has no dedicated DB state of its own, so it maps to "acknowledged"
// (the alert has been acted on but isn't closed out yet), same as
// "In Progress". "New" maps to "open" so re-selecting it is a no-op
// rather than accidentally reopening/touching an already-progressed alert.
function dbAlertStatusFor(status: AlertStatus): "open" | "acknowledged" | "resolved" {
  if (status === "Resolved") return "resolved";
  if (status === "New") return "open";
  return "acknowledged";
}

export const api = {
  async requestPasswordReset(email: string): Promise<void> {
    await request("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
  },

  async resetPassword(accessToken: string, newPassword: string): Promise<void> {
    await request("/auth/reset-password", {
      method: "POST",
      body: { access_token: accessToken, new_password: newPassword },
      auth: false,
    });
  },

  async signIn(email: string, password: string) {
    const session = await request<SessionResponse>("/auth/sign-in", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    if (session.user.role !== "provider") {
      throw new ApiError(403, "This account is not registered as a healthcare provider.");
    }
    return { ...session, provider: providerFromSession(session) };
  },

  async getDashboardSummary(): Promise<DashboardSummary> {
    const summary = await request<RawDashboardSummary>("/provider/dashboard/summary");
    return {
      totalPatients: summary.total_patients,
      highRisk: summary.high_risk,
      mediumRisk: summary.medium_risk,
      pendingReview: summary.pending_review,
      checkInsReceived: summary.check_ins_received,
      checkInsThisWeek: summary.check_ins_this_week,
      recentAlerts: [],
    };
  },

  async getPatients(risk?: string): Promise<QueueRow[]> {
    const query = risk && risk !== "all" ? `?risk=${encodeURIComponent(risk)}` : "";
    const rows = await request<RawQueueRow[]>(`/provider/patients${query}`);
    return rows.map(mapQueueRow);
  },

  async getPatientDetail(patientId: string): Promise<PatientDetail> {
    const detail = await request<RawPatientDetail>(`/provider/patients/${patientId}`);
    return mapPatientDetail(detail);
  },

  async getColleagues(): Promise<{ id: string; fullName: string }[]> {
    const colleagues = await request<{ id: string; full_name: string }[]>("/provider/colleagues");
    return colleagues.map((c) => ({ id: c.id, fullName: c.full_name }));
  },

  async reassignPatient(patientId: string, toProviderId: string): Promise<void> {
    await request(`/provider/patients/${patientId}/reassign`, {
      method: "POST",
      body: { to_provider_id: toProviderId },
    });
  },

  async getBPHistory(patientId: string): Promise<BPTrendPoint[]> {
    const readings = await request<RawBPReading[]>(`/provider/patients/${patientId}/bp-readings`);
    return readings.map((r) => ({
      id: r.id,
      systolic: r.systolic,
      diastolic: r.diastolic,
      measuredAt: r.measured_at,
    }));
  },

  async createFollowUp(
    patientId: string,
    input: {
      contact_method: ContactMethod;
      notes: string | null;
      next_advice: string | null;
      alert_status: AlertStatus;
      next_action_date: string | null;
      outcome: FollowUpOutcome;
      contacted_person: string | null;
      follow_up_date: string | null;
      follow_up_time: string | null;
      assigned_to_provider_id: string | null;
      notify_patient: boolean;
    },
  ): Promise<ApiFollowUp> {
    const detail = await request<RawPatientDetail>(`/provider/patients/${patientId}`);
    const alert = detail.open_alerts[0];
    if (!alert) {
      throw new ApiError(422, "This patient has no open alert to attach a follow-up to.");
    }
    const result = await request<RawFollowUpAction>(
      `/provider/patients/${patientId}/follow-ups`,
      {
        method: "POST",
        body: {
          alert_id: alert.id,
          action_type: actionTypeFor(input.contact_method),
          note_text: input.notes,
          next_advice: input.next_advice,
          outcome: input.outcome,
          status: followUpStatusFor(input.alert_status),
          alert_status: dbAlertStatusFor(input.alert_status),
          contacted_person: input.contacted_person,
          follow_up_date: input.follow_up_date,
          follow_up_time: input.follow_up_time,
          assigned_to_provider_id: input.assigned_to_provider_id,
          notify_patient: input.notify_patient,
          next_action_date: input.next_action_date,
        },
      },
    );
    return mapFollowUp(result, patientId);
  },

  async getFollowUps(patientId: string): Promise<ApiFollowUp[]> {
    const rows = await request<RawFollowUpAction[]>(
      `/provider/patients/${patientId}/follow-ups`,
    );
    return rows.map((row) => mapFollowUp(row, patientId));
  },

  getTimeline(patientId: string) {
    return request<TimelineEntry[]>(`/provider/patients/${patientId}/timeline`);
  },

  getAgentRuns(patientId: string) {
    return request<AgentRun[]>(`/provider/patients/${patientId}/agent-runs`);
  },

  async acknowledgeAlert(alertId: string): Promise<void> {
    await request(`/provider/alerts/${alertId}`, {
      method: "PATCH",
      body: { status: "acknowledged" },
    });
  },

  async dismissAlertAsNotUrgent(alertId: string): Promise<void> {
    await request(`/provider/alerts/${alertId}`, {
      method: "PATCH",
      body: { status: "resolved" },
    });
  },

  async submitRiskAssessmentFeedback(
    assessmentId: string,
    feedback: "helpful" | "not_helpful" | "reported",
    feedbackNote: string | null,
  ): Promise<void> {
    await request(`/provider/risk-assessments/${assessmentId}/feedback`, {
      method: "PATCH",
      body: { feedback, feedback_note: feedbackNote },
    });
  },

  async submitRiskAssessmentOverride(
    assessmentId: string,
    level: "low" | "medium" | "high",
    reason: string,
  ): Promise<void> {
    await request(`/provider/risk-assessments/${assessmentId}/override`, {
      method: "PATCH",
      body: { level, reason },
    });
  },

  getFollowUpTasks(status?: FollowUpTaskStatus) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<FollowUpTask[]>(`/provider/follow-up-tasks${query}`);
  },

  updateFollowUpTask(taskId: string, status: FollowUpTaskStatus) {
    return request<FollowUpTask>(`/provider/follow-up-tasks/${taskId}`, {
      method: "PATCH",
      body: { status },
    });
  },
};
