import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./providerApi";
import {
  getProviderSession,
  PROVIDER_SESSION_EXPIRED_EVENT,
  setProviderSession,
} from "./providerSession";

function storeSession() {
  setProviderSession({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: null,
    provider: {
      id: "provider-1",
      name: "Test Provider",
      email: "provider@example.com",
      clinic: "Test Clinic",
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("providerApi authentication", () => {
  it("attaches the bearer token to the real agent-run endpoint", async () => {
    storeSession();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.getAgentRuns("patient-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/provider/patients/patient-1/agent-runs",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-access-token" }),
      }),
    );
  });

  it("clears the session and emits an expiry event on 401", async () => {
    storeSession();
    const expired = vi.fn();
    window.addEventListener(PROVIDER_SESSION_EXPIRED_EVENT, expired, { once: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Invalid token" }),
      }),
    );

    await expect(api.getFollowUpTasks()).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        message: "Your session has expired. Please sign in again.",
      }),
    );
    expect(getProviderSession()).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
  });
});
