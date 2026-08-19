import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Typography from "@mui/material/Typography";
import { api, ApiError } from "../../lib/providerApi";
import type {
  FollowUpTask,
  FollowUpTaskPriority,
  FollowUpTaskStatus,
  QueueRow,
} from "../../types";

type StatusFilter = "all" | FollowUpTaskStatus;

const PRIORITY_COLORS: Record<FollowUpTaskPriority, { background: string; color: string }> = {
  high: { background: "#F7E1DE", color: "#B3261E" },
  medium: { background: "#FBF1D9", color: "#8A6D00" },
  low: { background: "#E4EFE7", color: "#1E6B3C" },
};

function label(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (letter: string) => letter.toUpperCase());
}

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

export default function FollowUpTasks() {
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [patients, setPatients] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (background) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [taskRows, patientRows] = await Promise.all([
          api.getFollowUpTasks(filter === "all" ? undefined : filter),
          api.getPatients(),
        ]);
        setTasks(taskRows);
        setPatients(
          Object.fromEntries(patientRows.map((patient: QueueRow) => [patient.id, patient.name])),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load follow-up tasks.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function updateTask(task: FollowUpTask, nextStatus: FollowUpTaskStatus) {
    setUpdatingId(task.id);
    setError(null);
    try {
      const updated = await api.updateFollowUpTask(task.id, nextStatus);
      setTasks((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setSuccess(`Task marked ${label(nextStatus).toLowerCase()}.`);
      await load(true);
    } catch (updateError) {
      if (updateError instanceof ApiError && updateError.status === 409) {
        await load(true);
        setError("This task was updated elsewhere. The latest task list has been loaded.");
      } else {
        setError(
          updateError instanceof Error ? updateError.message : "Could not update this task.",
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Box sx={{ p: 4, maxWidth: 1100 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h1" gutterBottom>
            AI Follow-up Tasks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review and action safety-approved workflow suggestions. Providers make the final
            decision.
          </Typography>
        </Box>
        <Button onClick={() => void load(true)} disabled={refreshing || loading}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Status
        </Typography>
        <Select
          size="small"
          value={filter}
          onChange={(event) => setFilter(event.target.value as StatusFilter)}
          inputProps={{ "aria-label": "Filter tasks by status" }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All tasks</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="in_progress">In progress</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="dismissed">Dismissed</MenuItem>
        </Select>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => void load()}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress aria-label="Loading follow-up tasks" />
        </Box>
      ) : tasks.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h3" gutterBottom>
            No follow-up tasks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No accessible tasks match this status. This is expected when no safety-approved agent
            workflow has created a task yet.
          </Typography>
        </Paper>
      ) : (
        tasks.map((task) => {
          const updating = updatingId === task.id;
          return (
            <Paper key={task.id} variant="outlined" sx={{ p: 2.5, mb: 1.5 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
                    <Chip
                      size="small"
                      label={`${label(task.priority)} priority`}
                      sx={{ ...PRIORITY_COLORS[task.priority], fontWeight: 700 }}
                    />
                    <Chip size="small" label={label(task.status)} variant="outlined" />
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {label(task.task_type)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {task.rationale}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    Patient: {patients[task.patient_id] ?? task.patient_id}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Created {formatDateTime(task.created_at)} · Due {formatDateTime(task.due_at)} ·
                    Completed {formatDateTime(task.completed_at)}
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
                  {task.status === "pending" && (
                    <Button
                      variant="contained"
                      disabled={updating}
                      onClick={() => void updateTask(task, "in_progress")}
                    >
                      {updating ? "Updating…" : "Start"}
                    </Button>
                  )}
                  {task.status === "in_progress" && (
                    <Button
                      variant="contained"
                      disabled={updating}
                      onClick={() => void updateTask(task, "completed")}
                    >
                      {updating ? "Updating…" : "Complete"}
                    </Button>
                  )}
                  {(task.status === "pending" || task.status === "in_progress") && (
                    <Button
                      variant="outlined"
                      color="secondary"
                      disabled={updating}
                      onClick={() => void updateTask(task, "dismissed")}
                    >
                      Dismiss
                    </Button>
                  )}
                </Box>
              </Box>
            </Paper>
          );
        })
      )}

      <Snackbar
        open={success !== null}
        autoHideDuration={3000}
        onClose={() => setSuccess(null)}
        message={success}
      />
    </Box>
  );
}
