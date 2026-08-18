/**
 * Talks to the FastAPI backend's /demo/* routes. This is the ONLY place
 * that knows the API base URL or attaches the bearer token — every
 * screen goes through here rather than calling fetch() directly.
 *
 * No API keys live in this app: the demo bearer token is just an opaque
 * patient id issued by /demo/auth/sign-in, safe to hold client-side for
 * this prototype's fictional demo data. The real OpenAI/Supabase keys
 * never leave the backend.
 */

import { getSession } from "../lib/storage";
import type {
  ApiBPReading,
  ApiCheckIn,
  ApiHistory,
  ApiHome,
  ApiMedication,
  ApiPatient,
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
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export const api = {
  signIn(email: string, password: string) {
    return request<{ access_token: string; patient: ApiPatient }>("/demo/auth/sign-in", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
  },

  getHome() {
    return request<ApiHome>("/demo/patient/home");
  },

  getMedications() {
    return request<ApiMedication[]>("/demo/patient/medications");
  },

  saveBPReading(input: {
    systolic: number;
    diastolic: number;
    pulse: number | null;
    measured_at: string;
    notes: string | null;
  }) {
    return request<ApiBPReading>("/demo/patient/bp", { method: "POST", body: input });
  },

  getLatestBP() {
    return request<ApiBPReading | null>("/demo/patient/bp/latest");
  },

  submitCheckIn(input: {
    missed_doses: boolean;
    missed_dose_count: number | null;
    medication_stopped: boolean;
    supply_bucket: SupplyBucket;
    difficulty_reported: boolean;
    difficulty_text: string | null;
    patient_submitted_at: string;
  }) {
    return request<ApiCheckIn>("/demo/patient/check-ins", { method: "POST", body: input });
  },

  getLatestCheckIn() {
    return request<ApiCheckIn | null>("/demo/patient/check-ins/latest");
  },

  getHistory() {
    return request<ApiHistory>("/demo/patient/history");
  },

  resetDemoData() {
    return request<{ status: string }>("/demo/reset", { method: "POST", auth: false });
  },
};
