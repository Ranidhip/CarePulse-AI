import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../lib/providerApi";
import type { FollowUpTask } from "../../types";
import FollowUpTasks from "./FollowUpTasks";

vi.mock("../../lib/providerApi", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  api: {
    getFollowUpTasks: vi.fn(),
    getPatients: vi.fn(),
    updateFollowUpTask: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

function task(overrides: Partial<FollowUpTask> = {}): FollowUpTask {
  return {
    id: "task-1",
    patient_id: "patient-1",
    agent_run_id: "run-1",
    task_type: "nurse_review",
    priority: "high",
    rationale: "Review the adherence concern reported in the check-in.",
    status: "pending",
    provider_id: null,
    due_at: null,
    created_at: "2026-08-19T08:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getFollowUpTasks.mockResolvedValue([task()]);
  mockedApi.getPatients.mockResolvedValue([
    {
      id: "patient-1",
      name: "Synthetic Patient",
      age: 55,
      latestBP: null,
      missedDoses: null,
      supplyBucket: null,
      riskLevel: "medium",
      mainReason: "Missed medication",
      lastCheckInDate: null,
      alertStatus: "New",
    },
  ]);
});

describe("FollowUpTasks", () => {
  it("renders task details and the patient name", async () => {
    render(<FollowUpTasks />);
    expect(await screen.findByText("Review the adherence concern reported in the check-in.")).toBeInTheDocument();
    expect(screen.getByText(/Synthetic Patient/)).toBeInTheDocument();
    expect(screen.getByText("High priority")).toBeInTheDocument();
  });

  it("requests the selected status filter", async () => {
    const user = userEvent.setup();
    render(<FollowUpTasks />);
    await screen.findByText("Synthetic Patient", { exact: false });

    await user.click(screen.getByLabelText("Filter tasks by status"));
    await user.click(screen.getByRole("option", { name: "In progress" }));

    await waitFor(() => expect(mockedApi.getFollowUpTasks).toHaveBeenLastCalledWith("in_progress"));
  });

  it("starts a pending task and refreshes", async () => {
    const user = userEvent.setup();
    mockedApi.updateFollowUpTask.mockResolvedValue(task({ status: "in_progress" }));
    render(<FollowUpTasks />);

    await user.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(mockedApi.updateFollowUpTask).toHaveBeenCalledWith("task-1", "in_progress"),
    );
    expect(await screen.findByText("Task marked in progress.")).toBeInTheDocument();
    expect(mockedApi.getFollowUpTasks).toHaveBeenCalledTimes(2);
  });

  it("completes an in-progress task", async () => {
    const user = userEvent.setup();
    mockedApi.getFollowUpTasks.mockResolvedValue([task({ status: "in_progress" })]);
    mockedApi.updateFollowUpTask.mockResolvedValue(
      task({ status: "completed", completed_at: "2026-08-19T09:00:00Z" }),
    );
    render(<FollowUpTasks />);

    await user.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() =>
      expect(mockedApi.updateFollowUpTask).toHaveBeenCalledWith("task-1", "completed"),
    );
  });

  it("dismisses a pending task", async () => {
    const user = userEvent.setup();
    mockedApi.updateFollowUpTask.mockResolvedValue(task({ status: "dismissed" }));
    render(<FollowUpTasks />);

    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(mockedApi.updateFollowUpTask).toHaveBeenCalledWith("task-1", "dismissed"),
    );
  });

  it("disables task buttons while an update is pending", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: FollowUpTask) => void;
    mockedApi.updateFollowUpTask.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(<FollowUpTasks />);

    const start = await screen.findByRole("button", { name: "Start" });
    await user.click(start);
    expect(start).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();
    resolveUpdate(task({ status: "in_progress" }));
    await waitFor(() => expect(mockedApi.getFollowUpTasks).toHaveBeenCalledTimes(2));
  });

  it("refreshes and explains a 409 conflict", async () => {
    const user = userEvent.setup();
    mockedApi.updateFollowUpTask.mockRejectedValue(
      new ApiError(409, "This task changed elsewhere. Refresh and try again."),
    );
    render(<FollowUpTasks />);

    await user.click(await screen.findByRole("button", { name: "Start" }));
    expect(await screen.findByText(/updated elsewhere/i)).toBeInTheDocument();
    expect(mockedApi.getFollowUpTasks).toHaveBeenCalledTimes(2);
  });

  it("shows a network failure and retry action", async () => {
    mockedApi.getFollowUpTasks.mockRejectedValue(new Error("Could not reach the backend."));
    render(<FollowUpTasks />);
    expect(await screen.findByText("Could not reach the backend.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
