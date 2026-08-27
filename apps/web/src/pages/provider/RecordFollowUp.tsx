import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import { getProviderSession } from "../../lib/providerSessionStore";
import { followUpFormSchema, validateOrError } from "../../lib/validation";
import type { AlertStatus, ContactMethod, FollowUpOutcome, PatientDetail } from "../../types";
import { ALERT_STATUSES, CONTACT_METHODS, FOLLOW_UP_OUTCOME_LABELS } from "../../types";

const OUTCOME_OPTIONS: FollowUpOutcome[] = [
  "contacted",
  "unreachable",
  "referred_to_doctor",
  "medication_supply_issue_reported",
  "other",
];

const NOTES_MAX_LENGTH = 600;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowHHMM(): string {
  return new Date().toTimeString().slice(0, 5);
}

export default function RecordFollowUp() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [colleagues, setColleagues] = useState<{ id: string; fullName: string }[]>([]);

  const session = getProviderSession();

  const [contactMethod, setContactMethod] = useState<ContactMethod>("Phone");
  const [contactedPerson, setContactedPerson] = useState("Patient");
  const [followUpDate, setFollowUpDate] = useState(todayISODate());
  const [followUpTime, setFollowUpTime] = useState(nowHHMM());
  const [outcome, setOutcome] = useState<FollowUpOutcome>("contacted");
  const [notes, setNotes] = useState("");
  const [nextAdvice, setNextAdvice] = useState("");
  const [alertStatus, setAlertStatus] = useState<AlertStatus>("New");
  const [nextActionDate, setNextActionDate] = useState("");
  const [assignedTo, setAssignedTo] = useState(session?.provider.id ?? "");
  const [notifyPatient, setNotifyPatient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    api
      .getPatientDetail(patientId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    api
      .getColleagues()
      .then(setColleagues)
      .catch(() => setColleagues([]));
  }, []);

  const assignableProviders = session
    ? [{ id: session.provider.id, fullName: `${session.provider.name} (You)` }, ...colleagues]
    : colleagues;

  async function handleSave() {
    if (!patientId) return;
    const validation = validateOrError(followUpFormSchema, { notes, next_advice: nextAdvice });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.createFollowUp(patientId, {
        contact_method: contactMethod,
        notes: validation.data.notes,
        next_advice: validation.data.next_advice || null,
        alert_status: alertStatus,
        next_action_date: nextActionDate || null,
        outcome,
        contacted_person: contactedPerson.trim() || null,
        follow_up_date: followUpDate || null,
        follow_up_time: followUpTime || null,
        assigned_to_provider_id: assignedTo || null,
        notify_patient: notifyPatient,
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
          Contact details
        </Typography>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          Contact method
        </Typography>
        <RadioGroup
          row
          value={contactMethod}
          onChange={(e) => setContactMethod(e.target.value as ContactMethod)}
          sx={{ mb: 2 }}
        >
          {CONTACT_METHODS.map((m) => (
            <FormControlLabel key={m} value={m} control={<Radio />} label={m} />
          ))}
        </RadioGroup>

        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Contacted person
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Patient"
              value={contactedPerson}
              onChange={(e) => setContactedPerson(e.target.value)}
            />
          </Box>
          <Box sx={{ width: 180 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Follow-up date
            </Typography>
            <TextField
              fullWidth
              size="small"
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          </Box>
          <Box sx={{ width: 140 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Time
            </Typography>
            <TextField
              fullWidth
              size="small"
              type="time"
              value={followUpTime}
              onChange={(e) => setFollowUpTime(e.target.value)}
            />
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h3" gutterBottom>
          Outcome and next action
        </Typography>
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Outcome
            </Typography>
            <Select
              fullWidth
              size="small"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as FollowUpOutcome)}
            >
              {OUTCOME_OPTIONS.map((o) => (
                <MenuItem key={o} value={o}>
                  {FOLLOW_UP_OUTCOME_LABELS[o]}
                </MenuItem>
              ))}
            </Select>
          </Box>
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
        </Box>

        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", mb: 1 }}>
          <Box sx={{ maxWidth: 220 }}>
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
          <Box sx={{ flex: 1, maxWidth: 280 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Assigned to
            </Typography>
            <Select fullWidth size="small" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              {assignableProviders.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.fullName}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <FormControlLabel
            control={<Checkbox checked={notifyPatient} onChange={(e) => setNotifyPatient(e.target.checked)} />}
            label="Notify patient in the app"
          />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h3" gutterBottom>
          Follow-up notes
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
          <Typography variant="body2">Notes</Typography>
          <Typography
            variant="caption"
            color={notes.length > NOTES_MAX_LENGTH ? "error" : "text.secondary"}
          >
            {notes.length}/{NOTES_MAX_LENGTH} characters
          </Typography>
        </Box>
        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder="Spoke with patient by phone. Patient reported difficulty remembering the evening dose."
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX_LENGTH))}
          slotProps={{ htmlInput: { maxLength: NOTES_MAX_LENGTH } }}
          sx={{ mb: 2 }}
        />

        <Typography variant="body2" sx={{ mb: 0.5 }}>
          Next advice
        </Typography>
        <TextField
          fullWidth
          placeholder="Continue current medicines, record BP daily for one week and attend clinic on 27 Aug."
          value={nextAdvice}
          onChange={(e) => setNextAdvice(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Box sx={{ border: "1px dashed #C9CCD1", borderRadius: 1, p: 1.5, minHeight: 40 }}>
          <Typography variant="body2" color={error ? "error" : "text.secondary"}>
            {error ?? "Notes are visible to the assigned provider and clinic supervisor."}
          </Typography>
        </Box>
      </Paper>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, justifyContent: "flex-end" }}>
        {saving && (
          <Typography variant="caption" color="text.secondary">
            This can take up to a minute if the server was asleep.
          </Typography>
        )}
        <Button variant="outlined" color="secondary" onClick={() => navigate(-1)} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Follow-up"}
        </Button>
      </Box>
    </Box>
  );
}
