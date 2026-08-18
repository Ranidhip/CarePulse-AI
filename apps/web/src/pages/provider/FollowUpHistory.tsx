import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import type { ApiFollowUp, PatientDetail } from "../../types";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export default function FollowUpHistory() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [followUps, setFollowUps] = useState<ApiFollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    Promise.all([api.getPatientDetail(patientId), api.getFollowUps(patientId)])
      .then(([d, f]) => {
        setData(d);
        setFollowUps(f);
      })
      .finally(() => setLoading(false));
  }, [patientId]);

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
        Follow-up History
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {data.patient.name} · {data.patient.id} · Chronological provider actions
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h3">{data.patient.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {followUps.length} follow-up record{followUps.length === 1 ? "" : "s"}
              {followUps[0] ? ` · Last contact ${formatDateTime(followUps[0].created_at)}` : ""}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <RiskBadge level={data.riskLevel} />
            <Button variant="contained" onClick={() => navigate(`/provider/patients/${data.patient.id}/follow-up`)}>
              Add Follow-up
            </Button>
          </Box>
        </Box>
      </Paper>

      <Typography variant="h3" sx={{ mb: 1.5 }}>
        Chronological timeline
      </Typography>

      {followUps.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No follow-up actions have been recorded yet.
          </Typography>
        </Paper>
      ) : (
        followUps.map((f) => (
          <Paper key={f.id} variant="outlined" sx={{ p: 2.5, mb: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {formatDateTime(f.created_at)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {f.contact_method}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {f.notes || "No notes recorded."}
            </Typography>
            {f.next_action && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Next action: {f.next_action}
                {f.next_action_date ? ` (by ${f.next_action_date})` : ""}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              Alert status: {f.alert_status}
            </Typography>
          </Paper>
        ))
      )}
    </Box>
  );
}
