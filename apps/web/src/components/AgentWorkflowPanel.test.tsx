import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentRun } from "../types";
import AgentWorkflowPanel from "./AgentWorkflowPanel";

const completedRun: AgentRun = {
  id: "run-1",
  check_in_id: "check-in-1",
  patient_id: "patient-1",
  status: "completed",
  started_at: "2026-08-19T08:00:00Z",
  completed_at: "2026-08-19T08:01:00Z",
  created_at: "2026-08-19T08:00:00Z",
  actions: [
    {
      id: "action-3",
      agent_name: "ClinicalSafetyAgent",
      action_type: "validate_safety",
      status: "success",
      requires_provider_approval: false,
      created_at: "2026-08-19T08:00:03Z",
    },
    {
      id: "action-1",
      agent_name: "CheckInAnalysisAgent",
      action_type: "analyze_check_in",
      status: "success",
      requires_provider_approval: false,
      created_at: "2026-08-19T08:00:01Z",
    },
    {
      id: "action-2",
      agent_name: "FollowUpCoordinatorAgent",
      action_type: "coordinate_follow_up",
      status: "success",
      requires_provider_approval: false,
      created_at: "2026-08-19T08:00:02Z",
    },
  ],
};

describe("AgentWorkflowPanel", () => {
  it("renders a successful workflow in the required agent order", () => {
    render(
      <AgentWorkflowPanel runs={[completedRun]} loading={false} error={null} onRetry={vi.fn()} />,
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    const agentLabels = screen.getAllByText(/^[123]\. /).map((node) => node.textContent);
    expect(agentLabels).toEqual([
      "1. Check-in analysis",
      "2. Follow-up coordination",
      "3. Clinical safety review",
    ]);
    expect(screen.queryByText(/tool_input|tool_output|prompt/i)).not.toBeInTheDocument();
  });

  it("renders the truthful no-run empty state", () => {
    render(<AgentWorkflowPanel runs={[]} loading={false} error={null} onRetry={vi.fn()} />);
    expect(screen.getByText("No agent workflow recorded")).toBeInTheDocument();
    expect(screen.getByText(/expected when AI is disabled/i)).toBeInTheDocument();
  });

  it("shows the manual-review safety state", () => {
    render(
      <AgentWorkflowPanel
        runs={[{ ...completedRun, status: "manual_review" }]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Manual review")).toBeInTheDocument();
    expect(screen.getByText(/Review the workflow evidence/i)).toBeInTheDocument();
  });
});
