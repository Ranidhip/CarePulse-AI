/**
 * Talks to the FastAPI backend's real, Supabase-backed production routes
 * (/auth/*, /patient/*) — the same routes the provider dashboard's data
 * ultimately comes from, so a check-in submitted here now actually shows
 * up on the provider side. This is the ONLY place that knows the API
 * base URL or attaches the bearer token — every screen goes through here
 * rather than calling fetch() directly.
 *
 * Raw snake_case API shapes are mapped to the view-model types in
 * ../types inside this file, the same "Raw* -> mapped" pattern
 * apps/web/src/lib/providerApi.ts uses for the provider dashboard.
 */

import { clearSession, getSession } from "../lib/storage";
import type {
  ApiBPReading,
  ApiCheckIn,
  ApiHistory,
  ApiHome,
  ApiMedication,
  ApiPatient,
  RiskLevel,
  SupplyBucket,
} from "../types";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function assertConfigured(): string {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Create apps/mobile/.env with " +
        "EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8000 and restart " +
        "the Expo dev server. See README for details."
    );
  }
  return API_URL;
}

async function errorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const base = assertConfigured();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (options.auth !== false) {
    const session = await getSession();
    if (session) headers.Authorization = `Bearer ${session.accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${base}. Make sure uvicorn is running ` +
        "and your phone is on the same Wi-Fi network as your computer."
    );
  }

  if (!res.ok) {
    // A real access token expires (unlike the old demo bearer token,
    // which never did) — drop the stale session so the next screen the
    // user lands on redirects to sign-in via useRequireSession.
    if (res.status === 401 && options.auth !== false) await clearSession();
    const detail = await errorDetail(res);
    throw new ApiError(res.status, detail || `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

/** 404 means "nothing yet" for a couple of these GETs — never a real error. */
async function requestOrNull<T>(path: string): Promise<T | null> {
  try {
    return await request<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

function makeIdempotencyKey(): string {
  return `checkin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Raw API shapes (backend/app/models/*.py) -----------------------------

interface RawSessionResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; role: string; is_active: boolean };
}

interface RawPatientProfile {
  id: string;
  full_name: string;
  age: number | null;
  contact_number: string | null;
  email: string;
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

interface RawRiskAssessmentSummary {
  rule_result_level: RiskLevel;
  final_level: RiskLevel;
  ai_status: string;
  provider_summary: string | null;
}

interface RawCheckInRecord {
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

interface RawPatientHome {
  full_name: string;
  medications: RawMedication[];
  latest_check_in: RawCheckInRecord | null;
  latest_check_in_risk: RawRiskAssessmentSummary | null;
  latest_bp: RawBPReading | null;
}

interface RawHistoryEntry {
  entry_type: "check_in" | "bp_reading";
  occurred_at: string;
  check_in: RawCheckInRecord | null;
  check_in_risk: RawRiskAssessmentSummary | null;
  bp_reading: RawBPReading | null;
}

interface RawCheckInLatestResponse {
  check_in: RawCheckInRecord;
  risk_assessment: RawRiskAssessmentSummary;
}

// --- Mapping helpers --------------------------------------------------

function mapMedication(m: RawMedication): ApiMedication {
  return {
    id: m.id,
    name: m.medication_name,
    instructions: m.dosage_description ?? "",
    scheduled_time: m.scheduled_time,
    supply_status: m.supply_status,
    reminder_enabled: m.reminder_enabled,
  };
}

function mapBPReading(r: RawBPReading): ApiBPReading {
  return {
    id: r.id,
    systolic: r.systolic,
    diastolic: r.diastolic,
    pulse: r.pulse,
    notes: r.notes,
    measured_at: r.measured_at,
  };
}

function mapCheckIn(c: RawCheckInRecord, risk: RawRiskAssessmentSummary | null): ApiCheckIn {
  return {
    id: c.id,
    missed_doses: c.missed_doses,
    missed_dose_count: c.missed_dose_count,
    medication_stopped: c.medication_stopped,
    supply_remaining: c.supply_remaining,
    difficulty_reported: c.difficulty_reported,
    difficulty_text: c.difficulty_text,
    patient_submitted_at: c.patient_submitted_at,
    server_received_at: c.server_received_at,
    risk_level: risk?.final_level ?? null,
    provider_summary: risk?.provider_summary ?? null,
  };
}

export const api = {
  async signIn(email: string, password: string) {
    const session = await request<RawSessionResponse>("/auth/sign-in", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    if (session.user.role !== "patient") {
      throw new ApiError(403, "This account is not registered as a patient.");
    }
    return session;
  },

  async signUp(input: {
    email: string;
    password: string;
    full_name: string;
    age?: number;
    contact_number?: string;
  }) {
    const session = await request<RawSessionResponse>("/auth/sign-up", {
      method: "POST",
      body: input,
      auth: false,
    });
    return session;
  },

  async getProfile(): Promise<ApiPatient> {
    const profile = await request<RawPatientProfile>("/patient/profile");
    return { id: profile.id, name: profile.full_name, email: profile.email, age: profile.age };
  },

  async getHome(): Promise<ApiHome> {
    const home = await request<RawPatientHome>("/patient/home");
    return {
      patient: { name: home.full_name },
      nextMedication: home.medications.length > 0 ? mapMedication(home.medications[0]) : null,
      latestCheckIn: home.latest_check_in
        ? mapCheckIn(home.latest_check_in, home.latest_check_in_risk)
        : null,
      latestBP: home.latest_bp ? mapBPReading(home.latest_bp) : null,
    };
  },

  async getMedications(): Promise<ApiMedication[]> {
    const meds = await request<RawMedication[]>("/patient/medications");
    return meds.map(mapMedication);
  },

  async createMedication(input: {
    medication_name: string;
    dosage_description?: string;
    scheduled_time?: string;
    supply_status: "adequate" | "low" | "out";
    reminder_enabled?: boolean;
  }): Promise<ApiMedication> {
    const med = await request<RawMedication>("/patient/medications", {
      method: "POST",
      body: input,
    });
    return mapMedication(med);
  },

  async updateMedication(
    id: string,
    input: Partial<{
      medication_name: string;
      dosage_description: string;
      scheduled_time: string;
      supply_status: "adequate" | "low" | "out";
      reminder_enabled: boolean;
    }>
  ): Promise<ApiMedication> {
    const med = await request<RawMedication>(`/patient/medications/${id}`, {
      method: "PATCH",
      body: input,
    });
    return mapMedication(med);
  },

  async deleteMedication(id: string): Promise<void> {
    await request<null>(`/patient/medications/${id}`, { method: "DELETE" });
  },

  async saveBPReading(input: {
    systolic: number;
    diastolic: number;
    pulse?: number | null;
    notes?: string | null;
    measured_at: string;
  }) {
    const reading = await request<RawBPReading>("/patient/bp-readings", {
      method: "POST",
      body: {
        systolic: input.systolic,
        diastolic: input.diastolic,
        pulse: input.pulse ?? null,
        notes: input.notes ?? null,
        measured_at: input.measured_at,
      },
    });
    return mapBPReading(reading);
  },

  async getLatestBP(): Promise<ApiBPReading | null> {
    const reading = await requestOrNull<RawBPReading>("/patient/bp-readings/latest");
    return reading ? mapBPReading(reading) : null;
  },

  async submitCheckIn(
    input: {
      missed_doses: boolean;
      missed_dose_count: number | null;
      medication_stopped: boolean;
      supply_bucket: SupplyBucket;
      difficulty_reported: boolean;
      difficulty_text: string | null;
      side_effects_reported: boolean;
      side_effects_text: string | null;
      patient_submitted_at: string;
    },
    // Overridable so the offline queue (lib/offlineQueue.ts) can retry the
    // exact same submission with the exact same key on every attempt —
    // generating a fresh key per retry would defeat the backend's
    // idempotency check and could create duplicate check-ins.
    idempotencyKey?: string
  ) {
    // supply_bucket -> the boolean the rule engine expects, same two-state
    // mapping the demo route used (backend/app/api/demo_patient.py).
    const supply_remaining = input.supply_bucket !== "0-2" && input.supply_bucket !== "none";
    return request<{ check_in_id: string; risk_assessment: RawRiskAssessmentSummary; message: string }>(
      "/patient/check-ins",
      {
        method: "POST",
        body: {
          idempotency_key: idempotencyKey ?? makeIdempotencyKey(),
          missed_doses: input.missed_doses,
          missed_dose_count: input.missed_dose_count,
          medication_stopped: input.medication_stopped,
          supply_remaining,
          difficulty_reported: input.difficulty_reported,
          difficulty_text: input.difficulty_text,
          side_effects_reported: input.side_effects_reported,
          side_effects_text: input.side_effects_text,
          requests_contact: false,
          patient_submitted_at: input.patient_submitted_at,
        },
      }
    );
  },

  async getLatestCheckIn(): Promise<ApiCheckIn | null> {
    const result = await requestOrNull<RawCheckInLatestResponse>("/patient/check-ins/latest");
    return result ? mapCheckIn(result.check_in, result.risk_assessment) : null;
  },

  async getHistory(): Promise<ApiHistory> {
    const entries = await request<RawHistoryEntry[]>("/patient/history");
    const checkIns: ApiCheckIn[] = [];
    const bpReadings: ApiBPReading[] = [];
    for (const entry of entries) {
      if (entry.entry_type === "check_in" && entry.check_in) {
        checkIns.push(mapCheckIn(entry.check_in, entry.check_in_risk));
      } else if (entry.entry_type === "bp_reading" && entry.bp_reading) {
        bpReadings.push(mapBPReading(entry.bp_reading));
      }
    }
    return { checkIns, bpReadings };
  },
};
