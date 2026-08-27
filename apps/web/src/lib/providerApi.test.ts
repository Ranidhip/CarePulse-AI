import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./providerApi";
import {
  getProviderSession,
  PROVIDER_SESSION_EXPIRED_EVENT,
  setProviderSession,
} from "./providerSessionStore";

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
  it("uses a generic invalid-credentials message for sign-in 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Account-specific backend detail" }),
      }),
    );

    await expect(api.signIn("nobody@example.com", "wrong")).rejects.toEqual(
      expect.objectContaining({ status: 401, message: "Invalid email or password." }),
    );
  });

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

describe("providerApi network resilience", () => {
  // The deployed backend runs on Render's free tier and can spin down
  // between requests; the first fetch after a gap fails as a plain
  // network error while the instance wakes up. These lock in that
  // request() retries such failures instead of surfacing them immediately.
  it("retries a network failure and resolves once fetch succeeds", async () => {
    vi.useFakeTimers();
    storeSession();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    const pending = api.getFollowUpTasks();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("surfaces a waking-up hint after retries are exhausted against a deployed base", async () => {
    vi.useFakeTimers();
    storeSession();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const pending = api.getFollowUpTasks();
    const assertion = expect(pending).rejects.toThrow(
      "The server may be waking up after a period of inactivity",
    );
    await vi.runAllTimersAsync();
    await assertion;

    vi.useRealTimers();
  });
});
