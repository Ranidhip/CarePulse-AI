import { Navigate, Outlet } from "react-router-dom";
import { getProviderSession } from "./providerSessionStore";

/** Wraps protected /provider/* routes: bounces to sign-in if no session. */
export function RequireProviderSession() {
  const session = getProviderSession();
  if (!session) {
    return <Navigate to="/provider/sign-in" replace />;
  }
  return <Outlet />;
}
