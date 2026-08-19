import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { AgentActionSummary, AgentName, AgentRun, AgentRunStatus } from "../types";

const AGENT_ORDER: Record<AgentName, number> = {
  CheckInAnalysisAgent: 0,
  FollowUpCoordinatorAgent: 1,
  ClinicalSafetyAgent: 2,
};

const AGENT_LABELS: Record<AgentName, string> = {
  CheckInAnalysisAgent: "1. Check-in analysis",
  FollowUpCoordinatorAgent: "2. Follow-up coordination",
  ClinicalSafetyAgent: "3. Clinical safety review",
};

const RUN_COLORS: Record<AgentRunStatus, { background: string; color: string }> = {
  completed: { background: "#E4EFE7", color: "#1E6B3C" },
  running: { background: "#E3EEF8", color: "#1D5F91" },
  manual_review: { background: "#FBF1D9", color: "#8A6D00" },
  failed: { background: "#F7E1DE", color: "#B3261E" },
};

const ACTION_COLORS: Record<AgentActionSummary["status"], { background: string; color: string }> = {
  success: { background: "#E4EFE7", color: "#1E6B3C" },
  failed: { background: "#F7E1DE", color: "#B3261E" },
  skipped: { background: "#EBEDEF", color: "#5C6570" },
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (letter: string) => letter.toUpperCase());
}

function ActionRow({ action }: { action: AgentActionSummary }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        py: 1.25,
        borderBottom: "1px solid #EEE",
      }}
    >
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {AGENT_LABELS[action.agent_name]}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatStatus(action.action_type)} · {formatDateTime(action.created_at)}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        {action.requires_provider_approval && (
          <Chip label="Provider review required" size="small" color="warning" variant="outlined" />
        )}
        <Chip
          label={formatStatus(action.status)}
          size="small"
          sx={{
            ...ACTION_COLORS[action.status],
            fontWeight: 700,
          }}
        />
      </Box>
    </Box>
  );
}

export default function AgentWorkflowPanel({
  runs,
  loading,
  error,
  onRetry,
}: {
  runs: AgentRun[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 3, gridColumn: "1 / -1" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h3">AI Agent Workflow</Typography>
          <Typography variant="caption" color="text.secondary">
            Provider-safe workflow evidence. Clinical decisions remain with the provider.
          </Typography>
        </Box>
        {!loading && <Button onClick={onRetry}>Refresh</Button>}
      </Box>

      {loading && (
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", py: 3 }}>
          <CircularProgress size={22} />
          <Typography variant="body2" color="text.secondary">
            Loading agent workflow…
          </Typography>
        </Box>
      )}

      {!loading && error && (
        <Box role="alert" sx={{ border: "1px solid #F1B8B3", p: 2, borderRadius: 1 }}>
          <Typography color="error" variant="body2" sx={{ mb: 1 }}>
            {error}
          </Typography>
          <Button size="small" onClick={onRetry}>
            Try again
          </Button>
        </Box>
      )}

      {!loading && !error && runs.length === 0 && (
        <Box sx={{ border: "1px dashed #C9CCD1", borderRadius: 1, p: 2.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            No agent workflow recorded
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This is expected when AI is disabled, unavailable, or the patient has not submitted a
            check-in since agent orchestration was enabled.
          </Typography>
        </Box>
      )}

      {!loading &&
        !error &&
        runs.map((run) => {
          const sortedActions = [...run.actions].sort(
            (left, right) => AGENT_ORDER[left.agent_name] - AGENT_ORDER[right.agent_name],
          );
          return (
            <Box key={run.id} sx={{ border: "1px solid #E0E0E0", borderRadius: 1, mb: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  p: 2,
                  backgroundColor: "#FAFAFA",
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Workflow run
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Started {formatDateTime(run.started_at)} · Completed{" "}
                    {formatDateTime(run.completed_at)}
                  </Typography>
                </Box>
                <Chip
                  label={formatStatus(run.status)}
                  size="small"
                  sx={{ ...RUN_COLORS[run.status], fontWeight: 700 }}
                />
              </Box>

              {run.status === "manual_review" && (
                <Typography
                  role="status"
                  variant="body2"
                  sx={{ mx: 2, mt: 2, p: 1.5, color: "#8A6D00", backgroundColor: "#FBF1D9" }}
                >
                  Manual review is required. Review the workflow evidence before taking any
                  follow-up action.
                </Typography>
              )}

              <Box sx={{ px: 2, pb: 1 }}>
                {sortedActions.length > 0 ? (
                  sortedActions.map((action) => <ActionRow key={action.id} action={action} />)
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No agent actions were recorded for this run.
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
    </Paper>
  );
}
