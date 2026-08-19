import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import AgentWorkflowPanel from "../../components/AgentWorkflowPanel";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import type { AgentRun, PatientDetail } from "../../types";
import { SUPPLY_LABELS } from "../../types";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export default function PatientRecord() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [agentRunsLoading, setAgentRunsLoading] = useState(true);
  const [agentRunsError, setAgentRunsError] = useState<string | null>(null);

  const loadAgentRuns = useCallback(async () => {
    if (!patientId) return;
    setAgentRunsLoading(true);
    setAgentRunsError(null);
    try {
      setAgentRuns(await api.getAgentRuns(patientId));
    } catch (agentError) {
      setAgentRunsError(
        agentError instanceof Error ? agentError.message : "Failed to load agent workflow.",
      );
    } finally {
      setAgentRunsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    api
      .getPatientDetail(patientId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load patient."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    void loadAgentRuns();
  }, [loadAgentRuns]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error || !data) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error ?? "Patient not found."}</Typography>
      </Box>
    );
  }

  const { patient, medications, latestCheckIn, latestBP, riskLevel, followUps } = data;

  return (
    <Box sx={{ p: 4, maxWidth: 1000 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Review patient-reported information before taking action.
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
          <Box>
            <Typography variant="h1">{patient.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Patient ID: {patient.id} · Age {patient.age} · {patient.email}
            </Typography>
          </Box>
          <RiskBadge level={riskLevel} />
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, mt: 3, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={() => navigate(`/provider/patients/${patient.id}/risk-review`)}>
            Review Risk Assessment
          </Button>
          <Button variant="outlined" color="secondary" onClick={() => navigate(`/provider/patients/${patient.id}/history`)}>
            View Full History
          </Button>
          <Button variant="outlined" color="secondary" onClick={() => navigate(`/provider/patients/${patient.id}/follow-up`)}>
            Record Follow-up
          </Button>
        </Box>
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h3" gutterBottom>
            Current medication schedule
          </Typography>
          {medications.length > 0 ? (
            medications.map((m) => (
              <Box key={m.id} sx={{ py: 1, borderBottom: "1px solid #EEE" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {m.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {m.instructions} · Scheduled {m.scheduled_time}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              No medications recorded.
            </Typography>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h3" gutterBottom>
            Latest blood-pressure reading
          </Typography>
          {latestBP ? (
            <>
              <Typography variant="h2">
                {latestBP.systolic} / {latestBP.diastolic} <Typography component="span" variant="body2">mmHg</Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Recorded {formatDateTime(latestBP.measured_at)}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No BP reading recorded yet.
            </Typography>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, gridColumn: "1 / -1" }}>
          <Typography variant="h3" gutterBottom>
            Latest weekly check-in
          </Typography>
          {latestCheckIn ? (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2 }}>
              <Field label="Submitted" value={formatDateTime(latestCheckIn.patient_submitted_at)} />
              <Field label="Missed doses" value={String(latestCheckIn.missed_dose_count ?? 0)} />
              <Field label="Stopped medication" value={latestCheckIn.medication_stopped ? "Yes" : "No"} />
              <Field label="Medicine supply" value={SUPPLY_LABELS[latestCheckIn.supply_bucket] ?? "—"} />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Check-in incomplete — this patient has not submitted a weekly check-in yet.
            </Typography>
          )}
        </Paper>

        <AgentWorkflowPanel
          runs={agentRuns}
          loading={agentRunsLoading}
          error={agentRunsError}
          onRetry={() => void loadAgentRuns()}
        />

        <Paper variant="outlined" sx={{ p: 3, gridColumn: "1 / -1" }}>
          <Typography variant="h3" gutterBottom>
            Previous follow-up actions
          </Typography>
          {followUps.length > 0 ? (
            followUps.slice(0, 3).map((f) => (
              <Box key={f.id} sx={{ py: 1, borderBottom: "1px solid #EEE" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatDateTime(f.created_at)} · {f.contact_method}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {f.notes || "No notes recorded."} · Status: {f.alert_status}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              No follow-up actions recorded yet.
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}
