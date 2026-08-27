import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import AgentWorkflowPanel from "../../components/AgentWorkflowPanel";
import BPTrendChart from "../../components/BPTrendChart";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import type { BPTrendPoint } from "../../lib/providerApi";
import type { AgentRun, PatientDetail } from "../../types";
import { REASON_CODE_LABELS, SUPPLY_LABELS } from "../../types";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

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
  const [bpHistory, setBpHistory] = useState<BPTrendPoint[]>([]);
  const [bpHistoryLoading, setBpHistoryLoading] = useState(true);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [colleagues, setColleagues] = useState<{ id: string; fullName: string }[]>([]);
  const [selectedColleague, setSelectedColleague] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    api
      .getBPHistory(patientId)
      .then((readings) => !cancelled && setBpHistory(readings))
      .finally(() => !cancelled && setBpHistoryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function openReassignForm() {
    setReassignError(null);
    setReassignOpen(true);
    try {
      const list = await api.getColleagues();
      setColleagues(list);
      if (list.length > 0) setSelectedColleague(list[0].id);
    } catch (e) {
      setReassignError(e instanceof Error ? e.message : "Could not load other providers.");
    }
  }

  async function handleReassign() {
    if (!selectedColleague || !patientId) return;
    setReassigning(true);
    setReassignError(null);
    try {
      await api.reassignPatient(patientId, selectedColleague);
      navigate("/provider");
    } catch (e) {
      setReassignError(e instanceof Error ? e.message : "Could not reassign this patient.");
    } finally {
      setReassigning(false);
    }
  }

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

  const { patient, medications, latestCheckIn, latestBP, riskLevel, followUps, openAlerts, assignedProviderName } = data;
  // Best-effort: alert-specific reason codes aren't tracked separately from
  // the assessment that created them, so the most recent check-in's reason
  // codes are shown as the likely cause — accurate for the common case of
  // one open alert tied to the latest check-in.
  const alertReasonCodes = latestCheckIn?.reason_codes ?? [];

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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {patient.condition ?? "Condition not recorded"}
              {" · Assigned "}
              {assignedProviderName ?? "Unassigned"}
              {patient.clinic ? ` · ${patient.clinic}` : ""}
              {patient.enrolledAt
                ? ` · Enrolled ${new Date(patient.enrolledAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`
                : ""}
            </Typography>
          </Box>
          <RiskBadge level={riskLevel} />
        </Box>

        <Box className="no-print" sx={{ display: "flex", gap: 1.5, mt: 3, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={() => navigate(`/provider/patients/${patient.id}/risk-review`)}>
            Review Risk Assessment
          </Button>
          <Button variant="outlined" color="secondary" onClick={() => navigate(`/provider/patients/${patient.id}/history`)}>
            View Full History
          </Button>
          <Button variant="outlined" color="secondary" onClick={() => navigate(`/provider/patients/${patient.id}/follow-up`)}>
            Record Follow-up
          </Button>
          <Button variant="outlined" color="secondary" onClick={() => window.print()}>
            Export as PDF
          </Button>
          <Button variant="outlined" color="secondary" onClick={openReassignForm}>
            Reassign to Another Provider
          </Button>
        </Box>

        {reassignOpen && (
          <Box className="no-print" sx={{ mt: 2, pt: 2, borderTop: "1px solid #EEE" }}>
            {colleagues.length === 0 && !reassignError ? (
              <Typography variant="body2" color="text.secondary">
                Loading other providers…
              </Typography>
            ) : colleagues.length === 0 ? null : (
              <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                <Select
                  size="small"
                  value={selectedColleague}
                  onChange={(e) => setSelectedColleague(e.target.value)}
                  sx={{ minWidth: 260 }}
                >
                  {colleagues.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.fullName}
                    </MenuItem>
                  ))}
                </Select>
                <Button variant="contained" onClick={handleReassign} disabled={reassigning}>
                  Confirm Reassignment
                </Button>
                <Button variant="outlined" color="secondary" onClick={() => setReassignOpen(false)}>
                  Cancel
                </Button>
              </Box>
            )}
            {reassignError && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                {reassignError}
              </Typography>
            )}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h3" gutterBottom>
          Open alerts
        </Typography>
        {openAlerts.length > 0 ? (
          openAlerts.map((alert) => (
            <Box
              key={alert.id}
              sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", py: 1.5, borderBottom: "1px solid #EEE" }}
            >
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                  <RiskBadge level={riskLevel} />
                  <Typography variant="caption" color="text.secondary">
                    Created {timeAgo(alert.createdAt)} · Status: {alert.status}
                  </Typography>
                </Box>
                {latestCheckIn?.summary ? (
                  <Typography variant="body2" color="text.secondary">
                    {latestCheckIn.summary}
                  </Typography>
                ) : alertReasonCodes.length > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {alertReasonCodes.map((code) => REASON_CODE_LABELS[code]).join(", ")}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Flagged for manual review.
                  </Typography>
                )}
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => navigate(`/provider/patients/${patient.id}/risk-review`)}
              >
                Review Assessment
              </Button>
            </Box>
          ))
        ) : (
          <Typography variant="body2" color="text.secondary">
            No open alerts for this patient.
          </Typography>
        )}
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h3" gutterBottom>
            Current medication schedule
          </Typography>
          {medications.length > 0 ? (
            medications.map((m) => (
              <Box key={m.id} sx={{ py: 1, borderBottom: "1px solid #EEE" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {m.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, color: m.reminder_on ? "success.main" : "text.secondary" }}
                  >
                    Reminder: {m.reminder_on ? "ON" : "OFF"}
                  </Typography>
                </Box>
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
                {latestBP.pulse != null && (
                  <Typography component="span" variant="body2" color="text.secondary">
                    {" "}
                    · Pulse {latestBP.pulse}
                  </Typography>
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Recorded {formatDateTime(latestBP.measured_at)}
              </Typography>
              {latestBP.notes && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontStyle: "italic" }}>
                  "{latestBP.notes}"
                </Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No BP reading recorded yet.
            </Typography>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, gridColumn: "1 / -1" }}>
          <Typography variant="h3" gutterBottom>
            Blood-pressure trend
          </Typography>
          {bpHistoryLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          ) : (
            <BPTrendChart readings={bpHistory} />
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, gridColumn: "1 / -1" }}>
          <Typography variant="h3" gutterBottom>
            Latest weekly check-in
          </Typography>
          {latestCheckIn ? (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
              <Field label="Submitted" value={formatDateTime(latestCheckIn.patient_submitted_at)} />
              <Field label="Missed doses" value={String(latestCheckIn.missed_dose_count ?? 0)} />
              <Field label="Stopped medication" value={latestCheckIn.medication_stopped ? "Yes" : "No"} />
              <Field label="Medicine supply" value={SUPPLY_LABELS[latestCheckIn.supply_bucket] ?? "—"} />
              <Field
                label="Side effects"
                value={
                  latestCheckIn.side_effects_reported
                    ? latestCheckIn.side_effects_text || "Yes"
                    : "None reported"
                }
              />
              <Field
                label="Difficulties"
                value={
                  latestCheckIn.difficulty_reported
                    ? latestCheckIn.difficulty_text || "Yes"
                    : "None reported"
                }
              />
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
