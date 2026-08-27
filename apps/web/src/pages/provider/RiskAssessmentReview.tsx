import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import RiskBadge from "../../components/RiskBadge";
import { api, ApiError } from "../../lib/providerApi";
import type { BPTrendPoint } from "../../lib/providerApi";
import { overrideReasonSchema, validateOrError } from "../../lib/validation";
import type { PatientDetail } from "../../types";
import { REASON_CODE_LABELS, SUPPLY_LABELS } from "../../types";

// Same abnormal-BP thresholds the deterministic rule engine uses
// (backend/app/services/rules/engine.py) for "high", and the 140/90
// hypertension reference BPTrendChart already draws, for "elevated" —
// reusing both rather than inventing a third set of numbers here.
const HIGH_SYSTOLIC_THRESHOLD = 180;
const HIGH_DIASTOLIC_THRESHOLD = 120;
const ELEVATED_SYSTOLIC_THRESHOLD = 140;
const ELEVATED_DIASTOLIC_THRESHOLD = 90;

function bpSeverityColor(systolic: number, diastolic: number): { bg: string; border: string } | null {
  if (systolic >= HIGH_SYSTOLIC_THRESHOLD || diastolic >= HIGH_DIASTOLIC_THRESHOLD) {
    return { bg: "#F7E1DE", border: "#B3261E" };
  }
  if (systolic >= ELEVATED_SYSTOLIC_THRESHOLD || diastolic >= ELEVATED_DIASTOLIC_THRESHOLD) {
    return { bg: "#FBF1D9", border: "#8A6D00" };
  }
  return null;
}

function formatReadingDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
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

const OVERRIDE_LEVELS: { value: "low" | "medium" | "high"; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function RiskAssessmentReview() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [overrideFormOpen, setOverrideFormOpen] = useState(false);
  const [overrideLevel, setOverrideLevel] = useState<"low" | "medium" | "high">("medium");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [submittingOverride, setSubmittingOverride] = useState(false);
  const [bpHistory, setBpHistory] = useState<BPTrendPoint[]>([]);
  const [bpHistoryLoading, setBpHistoryLoading] = useState(true);

  const load = useCallback(() => {
    if (!patientId) return;
    let cancelled = false;
    api
      .getPatientDetail(patientId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

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

  async function handleMarkInProgress() {
    const alertId = data?.openAlerts[0]?.id;
    if (!alertId) return;
    setActionError(null);
    setAcknowledging(true);
    try {
      await api.acknowledgeAlert(alertId);
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not update this alert.");
    } finally {
      setAcknowledging(false);
    }
  }

  async function handleDismissAsNotUrgent() {
    const alertId = data?.openAlerts[0]?.id;
    if (!alertId) return;
    setActionError(null);
    setDismissing(true);
    try {
      await api.dismissAlertAsNotUrgent(alertId);
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not dismiss this alert.");
    } finally {
      setDismissing(false);
    }
  }

  async function handleFeedback(feedback: "helpful" | "not_helpful" | "reported", note: string | null) {
    if (!data?.assessmentId) return;
    setActionError(null);
    setSubmittingFeedback(true);
    try {
      await api.submitRiskAssessmentFeedback(data.assessmentId, feedback, note);
      setReportFormOpen(false);
      setReportNote("");
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not submit feedback.");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function handleOverride() {
    if (!data?.assessmentId) return;
    const validation = validateOrError(overrideReasonSchema, overrideReason);
    if (!validation.ok) {
      setOverrideError(validation.error);
      return;
    }
    setOverrideError(null);
    setSubmittingOverride(true);
    try {
      await api.submitRiskAssessmentOverride(data.assessmentId, overrideLevel, validation.data);
      setOverrideFormOpen(false);
      setOverrideReason("");
      load();
    } catch (e) {
      setOverrideError(e instanceof ApiError ? e.message : "Could not save this override.");
    } finally {
      setSubmittingOverride(false);
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

  const {
    patient,
    latestCheckIn,
    riskLevel,
    ruleResultLevel,
    aiSuggestedLevel,
    aiConfidence,
    assessmentCreatedAt,
    modelVersion,
    openAlerts,
    feedback,
    providerOverrideLevel,
    providerOverrideReason,
  } = data;
  const hasOpenAlert = openAlerts.length > 0;
  const alertIsNew = openAlerts[0]?.status === "open";

  return (
    <Box sx={{ p: 4, maxWidth: 1100 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h1" gutterBottom>
            Risk Assessment Review
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {patient.name} · Patient ID: {patient.id} · Provider review required
          </Typography>
        </Box>
        {hasOpenAlert && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              color="secondary"
              disabled={dismissing || acknowledging}
              onClick={handleDismissAsNotUrgent}
            >
              Dismiss as not urgent
            </Button>
            <Button
              variant="contained"
              disabled={!alertIsNew || acknowledging || dismissing}
              onClick={handleMarkInProgress}
            >
              {alertIsNew ? "Mark In Progress" : "In Progress"}
            </Button>
          </Box>
        )}
      </Box>
      {actionError && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {actionError}
        </Typography>
      )}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Final risk indicator
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <RiskBadge level={riskLevel} />
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Rule-based result
            </Typography>
            <Typography variant="h3">{ruleResultLevel ? ruleResultLevel.toUpperCase() : "—"}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              AI-suggested result
            </Typography>
            <Typography variant="h3">
              {aiSuggestedLevel ? aiSuggestedLevel.toUpperCase() : "—"}
              {aiConfidence != null && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {" "}
                  · {Math.round(aiConfidence * 100)}% confidence
                </Typography>
              )}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Manual review status
            </Typography>
            {providerOverrideLevel ? (
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Overridden to {providerOverrideLevel.toUpperCase()} by provider
              </Typography>
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Provider decision pending
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #EEE" }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            Model information
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Suggested tier
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                {aiSuggestedLevel ? aiSuggestedLevel.toUpperCase() : "—"}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Confidence
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                {aiConfidence != null ? `${Math.round(aiConfidence * 100)}%` : "—"}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Generated
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                {formatDateTime(assessmentCreatedAt)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Model version
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                {modelVersion ?? "Not yet reviewed"}
              </Typography>
            </Box>
          </Box>
        </Box>

        {providerOverrideLevel ? (
          <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #EEE" }}>
            <Typography variant="body2" color="text.secondary">
              <b>Override reason:</b> {providerOverrideReason}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #EEE" }}>
            {overrideFormOpen ? (
              <Box>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                  Override risk level
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                  {OVERRIDE_LEVELS.map((opt) => (
                    <Button
                      key={opt.value}
                      size="small"
                      variant={overrideLevel === opt.value ? "contained" : "outlined"}
                      color="secondary"
                      onClick={() => setOverrideLevel(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  placeholder="Why are you overriding the system's risk level? (required)"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  sx={{ mb: 1 }}
                />
                {overrideError && (
                  <Typography variant="caption" color="error" sx={{ display: "block", mb: 1 }}>
                    {overrideError}
                  </Typography>
                )}
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleOverride}
                    disabled={submittingOverride}
                  >
                    Save Override
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    onClick={() => {
                      setOverrideFormOpen(false);
                      setOverrideError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <Button size="small" variant="outlined" onClick={() => setOverrideFormOpen(true)}>
                Override Risk Level
              </Button>
            )}
          </Box>
        )}
      </Paper>

      {!latestCheckIn ? (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            This patient has not submitted a weekly check-in yet — there is no evidence to review.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, mb: 3 }}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="h3">Original patient information</Typography>
              <Chip label="Patient-reported, unedited" size="small" />
            </Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <b>Missed medication:</b> {latestCheckIn.missed_doses ? "Yes" : "No"}
              {latestCheckIn.missed_dose_count ? ` · ${latestCheckIn.missed_dose_count} doses` : ""}
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <b>Stopped medication:</b> {latestCheckIn.medication_stopped ? "Yes" : "No"}
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <b>Medicine supply:</b> {SUPPLY_LABELS[latestCheckIn.supply_bucket] ?? "—"}
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <b>Side effects:</b> {latestCheckIn.side_effects_reported ? "Yes" : "No"}
              {latestCheckIn.side_effects_reported && latestCheckIn.side_effects_text
                ? ` — "${latestCheckIn.side_effects_text}"`
                : ""}
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              <b>Difficulty reported:</b> {latestCheckIn.difficulty_reported ? "Yes" : "No"}
            </Typography>
            {latestCheckIn.difficulty_text && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                "{latestCheckIn.difficulty_text}"
              </Typography>
            )}

            <Typography variant="body2" sx={{ mt: 1.5, mb: 1 }}>
              <b>Self-recorded blood pressure</b>
            </Typography>
            {bpHistoryLoading ? (
              <Typography variant="body2" color="text.secondary">
                Loading…
              </Typography>
            ) : bpHistory.length > 0 ? (
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                {bpHistory
                  .slice(-4)
                  .reverse()
                  .map((reading) => {
                    const severity = bpSeverityColor(reading.systolic, reading.diastolic);
                    return (
                      <Box
                        key={reading.id}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          border: `1px solid ${severity?.border ?? "#E0E0E0"}`,
                          backgroundColor: severity?.bg ?? "transparent",
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {reading.systolic} / {reading.diastolic}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatReadingDateTime(reading.measuredAt)}
                        </Typography>
                      </Box>
                    );
                  })}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No blood-pressure readings recorded yet.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              Readings are patient-recorded and not clinically verified.
            </Typography>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="h3">AI-generated summary</Typography>
              <Chip label="Requires provider verification" size="small" />
            </Box>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {latestCheckIn.summary}
            </Typography>

            {feedback ? (
              <Typography variant="caption" color="text.secondary">
                {feedback === "helpful" && "You marked this summary Helpful."}
                {feedback === "not_helpful" && "You marked this summary Not helpful."}
                {feedback === "reported" && "You reported an issue with this summary."}
              </Typography>
            ) : reportFormOpen ? (
              <Box>
                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  placeholder="What's wrong with this summary? (optional)"
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  sx={{ mb: 1 }}
                />
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    onClick={() => handleFeedback("reported", reportNote.trim() || null)}
                    disabled={submittingFeedback}
                  >
                    Submit Report
                  </Button>
                  <Button size="small" variant="outlined" color="secondary" onClick={() => setReportFormOpen(false)}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleFeedback("helpful", null)}
                  disabled={submittingFeedback}
                >
                  Helpful
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleFeedback("not_helpful", null)}
                  disabled={submittingFeedback}
                >
                  Not helpful
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => setReportFormOpen(true)}
                  disabled={submittingFeedback}
                >
                  Report an issue
                </Button>
              </Box>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, gridColumn: "1 / -1" }}>
            <Typography variant="h3" gutterBottom>
              Rule-based reason codes
            </Typography>
            {latestCheckIn.reason_codes.length > 0 ? (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {latestCheckIn.reason_codes.map((code) => (
                  <Chip key={code} label={REASON_CODE_LABELS[code]} size="small" variant="outlined" />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No priority reason codes triggered.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
              Supporting evidence is traceable to the answers shown above. Rule version: {latestCheckIn.rule_version}.
            </Typography>
          </Paper>
        </Box>
      )}

      <Paper variant="outlined" sx={{ p: 2.5, backgroundColor: "#FAFAFA" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The healthcare provider makes the final decision. CarePulse AI does not
          diagnose or recommend medication changes.
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Button variant="outlined" color="secondary" onClick={() => navigate(`/provider/patients/${patient.id}`)}>
            Skip Assessment Summary
          </Button>
          <Button variant="contained" onClick={() => navigate(`/provider/patients/${patient.id}/follow-up`)}>
            Record Follow-up
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
