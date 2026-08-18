import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import type { AlertStatus, ContactMethod, PatientDetail } from "../../types";
import { ALERT_STATUSES, CONTACT_METHODS } from "../../types";

export default function RecordFollowUp() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [contactMethod, setContactMethod] = useState<ContactMethod>("Phone");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [alertStatus, setAlertStatus] = useState<AlertStatus>("New");
  const [nextActionDate, setNextActionDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    api
      .getPatientDetail(patientId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [patientId]);

  async function handleSave() {
    if (!patientId) return;
    if (!notes.trim()) {
      setError("Notes are required before an alert can be marked Resolved or saved.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.createFollowUp(patientId, {
        contact_method: contactMethod,
        notes: notes.trim(),
        next_action: nextAction.trim() || null,
        alert_status: alertStatus,
        next_action_date: nextActionDate || null,
      });
      navigate(`/provider/patients/${patientId}/history`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this follow-up.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, maxWidth: 800 }}>
      <Typography variant="h1" gutterBottom>
        Record Follow-up
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Document the provider action and update the alert status.
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h3">{data.patient.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {data.patient.id} · Age {data.patient.age}
            </Typography>
          </Box>
          <RiskBadge level={data.riskLevel} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h3" gutterBottom>
          Contact method
        </Typography>
        <RadioGroup
          row
          value={contactMethod}
          onChange={(e) => setContactMethod(e.target.value as ContactMethod)}
          sx={{ mb: 3 }}
        >
          {CONTACT_METHODS.map((m) => (
            <FormControlLabel key={m} value={m} control={<Radio />} label={m} />
          ))}
        </RadioGroup>

        <Typography variant="body2" sx={{ mb: 0.5 }}>
          Notes
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder="Spoke with patient by phone. Patient reported difficulty remembering the evening dose."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Typography variant="body2" sx={{ mb: 0.5 }}>
          Next action
        </Typography>
        <TextField
          fullWidth
          placeholder="Call again in one week to confirm medicine supply and reminder."
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: "flex", gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Alert status
            </Typography>
            <Select fullWidth size="small" value={alertStatus} onChange={(e) => setAlertStatus(e.target.value as AlertStatus)}>
              {ALERT_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Next action date
            </Typography>
            <TextField
              fullWidth
              size="small"
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
            />
          </Box>
        </Box>

        <Box sx={{ border: "1px dashed #C9CCD1", borderRadius: 1, p: 1.5, mt: 2, minHeight: 40 }}>
          <Typography variant="body2" color={error ? "error" : "text.secondary"}>
            {error ?? "Notes are required before an alert can be marked Resolved."}
          </Typography>
        </Box>
      </Paper>

      <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
        <Button variant="outlined" color="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          Save Follow-up
        </Button>
      </Box>
    </Box>
  );
}
