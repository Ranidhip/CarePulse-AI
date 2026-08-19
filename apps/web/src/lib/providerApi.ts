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
  FollowUpTask,
  FollowUpTaskStatus,
  PatientDetail,
  ProviderProfile,
  QueueRow,
  ReasonCode,
  RiskLevel,
} from "../types";
import { expireProviderSession, getProviderSession } from "./providerSession";

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

function publicErrorMessage(status: number, detail: string | null): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
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
    throw new ApiError(response.status, publicErrorMessage(response.status, detail));
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
}

interface RawBPReading {
  id: string;
  systolic: number;
  diastolic: number;
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
  requests_contact: boolean;
  patient_submitted_at: string;
  server_received_at: string;
}

interface RawAssessment {
  id: string;
  rule_result_level: string;
  final_level: "low" | "medium" | "high";
  ai_status: string;
  requires_manual_review: boolean;
  provider_summary: string | null;
  model_version: string | null;
  created_at: string;
  reasons: { reason_code: string; source: string; evidence_text: string | null }[];
}

interface RawAlert {
  id: string;
  patient_id: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
}

interface RawFollowUpAction {
  id: string;
  alert_id: string;
  provider_id: string;
  action_type: "note" | "phone_call" | "reassignment" | "status_update";
  note_text: string | null;
  outcome: string | null;
  status: "needs_review" | "in_progress" | "completed";
  created_at: string;
}

interface RawPatientDetail {
  profile: {
    id: string;
    full_name: string;
    age: number | null;
    contact_number: string | null;
  };
  medications: RawMedication[];
  latest_bp: RawBPReading | null;
  latest_check_in: { check_in: RawCheckIn; assessment: RawAssessment | null } | null;
  open_alerts: RawAlert[];
  follow_ups: RawFollowUpAction[];
}

const REASON_LABELS: Record<string, string> = {
  MEDICATION_STOPPED: "Medication stopped",
  ABNORMAL_BP: "Elevated BP recorded",
  MISSED_DOSES: "Missed medication",
  LOW_SUPPLY: "Medicine supply low",
  SCHEDULE_DIFFICULTY: "Treatment difficulty reported",
};

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

function mapFollowUp(row: RawFollowUpAction, patientId: string): ApiFollowUp {
  return {
    id: row.id,
    patient_id: patientId,
    provider_id: row.provider_id,
    contact_method: row.action_type === "phone_call" ? "Phone" : "Other",
    notes: row.note_text,
    next_action: null,
    alert_status:
      row.status === "completed"
        ? "Resolved"
        : row.status === "in_progress"
          ? "In Progress"
          : "Follow-up Recorded",
    next_action_date: null,
    created_at: row.created_at,
  };
}

function mapPatientDetail(raw: RawPatientDetail): PatientDetail {
  const assessment = raw.latest_check_in?.assessment ?? null;
  const checkIn = raw.latest_check_in?.check_in ?? null;
  const reasonCodes = (assessment?.reasons ?? [])
    .map((reason) => reason.reason_code)
    .filter((code): code is ReasonCode => code in REASON_LABELS);

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
      patient_submitted_at: checkIn.patient_submitted_at,
      risk_level: assessment?.final_level ?? "low",
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
    reminder_on: 0,
  }));

  return {
    patient: {
      id: raw.profile.id,
      name: raw.profile.full_name,
      email: raw.profile.contact_number ?? "Contact not provided",
      age: raw.profile.age ?? 0,
    },
    medications,
    latestCheckIn: mappedCheckIn,
    latestBP: raw.latest_bp
      ? {
          ...raw.latest_bp,
          patient_id: raw.profile.id,
          pulse: null,
          notes: null,
        }
      : null,
    riskLevel: assessment?.final_level ?? "pending",
    followUps: raw.follow_ups.map((followUp) => mapFollowUp(followUp, raw.profile.id)),
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

export const api = {
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

  async createFollowUp(
    patientId: string,
    input: {
      contact_method: ContactMethod;
      notes: string | null;
      next_action: string | null;
      alert_status: AlertStatus;
      next_action_date: string | null;
    },
  ): Promise<ApiFollowUp> {
    const detail = await request<RawPatientDetail>(`/provider/patients/${patientId}`);
    const alert = detail.open_alerts[0];
    if (!alert) {
      throw new ApiError(422, "This patient has no open alert to attach a follow-up to.");
    }
    const note = [input.notes, input.next_action ? `Next action: ${input.next_action}` : null]
      .filter(Boolean)
      .join("\n");
    const result = await request<RawFollowUpAction>(
      `/provider/patients/${patientId}/follow-ups`,
      {
        method: "POST",
        body: {
          alert_id: alert.id,
          action_type: actionTypeFor(input.contact_method),
          note_text: note || null,
          outcome: input.contact_method === "Unable to Reach" ? "unreachable" : "other",
          status: followUpStatusFor(input.alert_status),
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

  getAgentRuns(patientId: string) {
    return request<AgentRun[]>(`/provider/patients/${patientId}/agent-runs`);
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
