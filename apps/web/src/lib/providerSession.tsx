import { Navigate, Outlet } from "react-router-dom";
import type { ProviderSession } from "../types";

const KEY = "carepulse:provider_session";

export function getProviderSession(): ProviderSession | null {
  const raw = sessionStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as ProviderSession) : null;
}

export function setProviderSession(session: ProviderSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearProviderSession(): void {
  sessionStorage.removeItem(KEY);
}

/** Wraps protected /provider/* routes: bounces to sign-in if no session. */
export function RequireProviderSession() {
  const session = getProviderSession();
  if (!session) {
    return <Navigate to="/provider/sign-in" replace />;
  }
  return <Outlet />;
}
