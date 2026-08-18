import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import type { PatientDetail } from "../../types";
import { REASON_CODE_LABELS, SUPPLY_LABELS } from "../../types";

export default function RiskAssessmentReview() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const { patient, latestCheckIn, riskLevel } = data;

  return (
    <Box sx={{ p: 4, maxWidth: 1100 }}>
      <Typography variant="h1" gutterBottom>
        Risk Assessment Review
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {patient.name} · Patient ID: {patient.id} · Provider review required
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
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
            <Typography variant="h3">{riskLevel.toUpperCase()}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Manual review status
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
              Provider decision pending
            </Typography>
          </Box>
        </Box>
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
              <b>Difficulty reported:</b> {latestCheckIn.difficulty_reported ? "Yes" : "No"}
            </Typography>
            {latestCheckIn.difficulty_text && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                "{latestCheckIn.difficulty_text}"
              </Typography>
            )}
            {latestCheckIn.systolic && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <b>Latest BP:</b> {latestCheckIn.systolic}/{latestCheckIn.diastolic} mmHg
              </Typography>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="h3">Prototype-generated summary</Typography>
              <Chip label="Provider review required" size="small" />
            </Box>
            <Typography variant="body2">{latestCheckIn.summary}</Typography>
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
        <Button variant="contained" onClick={() => navigate(`/provider/patients/${patient.id}/follow-up`)}>
          Record Follow-up
        </Button>
      </Paper>
    </Box>
  );
}
