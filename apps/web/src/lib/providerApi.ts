/**
 * Talks to the FastAPI backend's /demo/provider/* routes. This is the
 * only place that knows the API base URL or attaches the bearer token —
 * every page goes through here rather than calling fetch() directly.
 *
 * No API keys live in this app: the demo bearer token is just an opaque
 * provider id issued by /demo/provider/auth/sign-in. The real
 * OpenAI/Supabase keys never leave the backend.
 */

import { getProviderSession } from "./providerSession";
import type {
  ApiFollowUp,
  ContactMethod,
  AlertStatus,
  DashboardSummary,
  PatientDetail,
  ProviderProfile,
  QueueRow,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

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
      "VITE_API_URL is not set. Create apps/web/.env with VITE_API_URL=http://localhost:8000 and restart the Vite dev server."
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
    const session = getProviderSession();
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
      `Could not reach the backend at ${base}. Make sure uvicorn is running with --host 0.0.0.0 and DEMO_MODE=true.`
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
    return request<{ access_token: string; provider: ProviderProfile }>(
      "/demo/provider/auth/sign-in",
      { method: "POST", body: { email, password }, auth: false }
    );
  },

  getDashboardSummary() {
    return request<DashboardSummary>("/demo/provider/dashboard/summary");
  },

  getPatients(risk?: string) {
    const qs = risk && risk !== "all" ? `?risk=${encodeURIComponent(risk)}` : "";
    return request<QueueRow[]>(`/demo/provider/patients${qs}`);
  },

  getPatientDetail(patientId: string) {
    return request<PatientDetail>(`/demo/provider/patients/${patientId}`);
  },

  createFollowUp(
    patientId: string,
    input: {
      contact_method: ContactMethod;
      notes: string | null;
      next_action: string | null;
      alert_status: AlertStatus;
      next_action_date: string | null;
    }
  ) {
    return request<ApiFollowUp>(`/demo/provider/patients/${patientId}/follow-up`, {
      method: "POST",
      body: input,
    });
  },

  getFollowUps(patientId: string) {
    return request<ApiFollowUp[]>(`/demo/provider/patients/${patientId}/follow-ups`);
  },
};
