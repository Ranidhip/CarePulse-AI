import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../lib/providerApi";
import ResetPassword from "./ResetPassword";

vi.mock("../../lib/providerApi", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  api: { resetPassword: vi.fn() },
}));

const mockedApi = vi.mocked(api);

function renderWithHash(hash: string) {
  window.location.hash = hash;
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  );
}

describe("ResetPassword", () => {
  afterEach(() => {
    window.location.hash = "";
    vi.clearAllMocks();
  });

  it("shows an invalid-link message when the URL has no access token", () => {
    renderWithHash("");
    expect(
      screen.getByText(/This reset link is invalid or has expired/),
    ).toBeInTheDocument();
  });

  it("submits the new password using the token from the URL hash", async () => {
    const user = userEvent.setup();
    mockedApi.resetPassword.mockResolvedValueOnce(undefined);
    renderWithHash("#access_token=recovery-token-123&type=recovery");

    await user.type(screen.getByLabelText("New password"), "a-new-secure-password");
    await user.type(screen.getByLabelText("Confirm new password"), "a-new-secure-password");
    await user.click(screen.getByRole("button", { name: "Set New Password" }));

    expect(mockedApi.resetPassword).toHaveBeenCalledWith(
      "recovery-token-123",
      "a-new-secure-password",
    );
    expect(await screen.findByText(/Your password has been updated/)).toBeInTheDocument();
  });

  it("rejects mismatched passwords without calling the API", async () => {
    const user = userEvent.setup();
    renderWithHash("#access_token=recovery-token-123&type=recovery");

    await user.type(screen.getByLabelText("New password"), "a-new-secure-password");
    await user.type(screen.getByLabelText("Confirm new password"), "does-not-match");
    await user.click(screen.getByRole("button", { name: "Set New Password" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(mockedApi.resetPassword).not.toHaveBeenCalled();
  });

  it("shows the backend's error message when the reset call fails", async () => {
    const user = userEvent.setup();
    mockedApi.resetPassword.mockRejectedValueOnce(
      new ApiError(401, "This reset link is invalid or has expired. Request a new one."),
    );
    renderWithHash("#access_token=expired-token&type=recovery");

    await user.type(screen.getByLabelText("New password"), "a-new-secure-password");
    await user.type(screen.getByLabelText("Confirm new password"), "a-new-secure-password");
    await user.click(screen.getByRole("button", { name: "Set New Password" }));

    expect(
      await screen.findByText("This reset link is invalid or has expired. Request a new one."),
    ).toBeInTheDocument();
  });
});
