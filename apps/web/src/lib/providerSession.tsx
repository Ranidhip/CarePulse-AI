import { Navigate, Outlet } from "react-router-dom";
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

/** Wraps protected /provider/* routes: bounces to sign-in if no session. */
export function RequireProviderSession() {
  const session = getProviderSession();
  if (!session) {
    return <Navigate to="/provider/sign-in" replace />;
  }
  return <Outlet />;
}
