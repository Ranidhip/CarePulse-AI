import type { ProviderSession } from "../types";

const KEY = "carepulse:provider_session";
export const PROVIDER_SESSION_EXPIRED_EVENT = "carepulse:provider-session-expired";

/**
 * Session lives in sessionStorage by default (cleared when the tab/
 * browser closes) or localStorage when the caller opts into "Remember
 * password" at sign-in (persists across browser restarts). Only one
 * backend ever holds the live session at a time — setProviderSession
 * clears the other so a stale copy can't resurface after sign-out or a
 * later sign-in with the opposite choice.
 */
export function getProviderSession(): ProviderSession | null {
  const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProviderSession;
  } catch {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export function setProviderSession(session: ProviderSession, remember = false): void {
  const json = JSON.stringify(session);
  if (remember) {
    localStorage.setItem(KEY, json);
    sessionStorage.removeItem(KEY);
  } else {
    sessionStorage.setItem(KEY, json);
    localStorage.removeItem(KEY);
  }
}

export function clearProviderSession(): void {
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);
}

export function expireProviderSession(): void {
  clearProviderSession();
  window.dispatchEvent(new Event(PROVIDER_SESSION_EXPIRED_EVENT));
}
