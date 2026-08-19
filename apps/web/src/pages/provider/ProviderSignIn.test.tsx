import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../lib/providerApi";
import ProviderSignIn from "./ProviderSignIn";

vi.mock("../../lib/providerApi", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  api: { signIn: vi.fn() },
}));

const mockedApi = vi.mocked(api);

describe("ProviderSignIn", () => {
  it("shows the generic invalid-credentials message", async () => {
    const user = userEvent.setup();
    mockedApi.signIn.mockRejectedValueOnce(new ApiError(401, "Invalid email or password."));
    render(
      <MemoryRouter>
        <ProviderSignIn />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("anjali.silva@clinic.lk"), "bad@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });

  it("shows the session-expired message after an authenticated 401 redirect", () => {
    render(
      <MemoryRouter initialEntries={["/provider/sign-in?expired=1"]}>
        <ProviderSignIn />
      </MemoryRouter>,
    );
    expect(screen.getByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
  });
});
