import type { ProviderSession } from "../types";

const KEY = "carepulse:provider_session";
export const PROVIDER_SESSION_EXPIRED_EVENT = "carepulse:provider-session-expired";

export function getProviderSession(): ProviderSession | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProviderSession;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export function setProviderSession(session: ProviderSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearProviderSession(): void {
  sessionStorage.removeItem(KEY);
}

export function expireProviderSession(): void {
  clearProviderSession();
  window.dispatchEvent(new Event(PROVIDER_SESSION_EXPIRED_EVENT));
}
