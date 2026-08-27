import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import type { TimelineEntry } from "../../lib/providerApi";
import type { PatientDetail } from "../../types";

type Filter = "all" | "provider" | "check_ins";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "provider", label: "Provider actions" },
  { value: "check_ins", label: "Check-ins" },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function entryTitle(entry: TimelineEntry): string {
  if (entry.entry_type === "check_in") return "Weekly check-in submitted";
  if (entry.entry_type === "alert") return `Alert ${String(entry.data.status ?? "").replace(/_/g, " ")}`;
  const actionType = String(entry.data.action_type ?? "");
  return actionType === "phone_call" ? "Patient contacted — phone" : "Follow-up recorded";
}

function entryDetail(entry: TimelineEntry): string {
  if (entry.entry_type === "check_in") {
    const missed = entry.data.missed_dose_count;
    const stopped = entry.data.medication_stopped;
    const difficulty = entry.data.difficulty_reported;
    const parts: string[] = [];
    if (typeof missed === "number" && missed > 0) parts.push(`${missed} missed doses`);
    if (stopped) parts.push("medication stopped");
    if (difficulty) parts.push("difficulty reported");
    return parts.length > 0 ? parts.join(" · ") : "No adherence concerns reported.";
  }
  if (entry.entry_type === "alert") {
    return "Raised from a weekly check-in or blood-pressure reading requiring provider review.";
  }
  const notes = entry.data.note_text;
  const outcome = entry.data.outcome;
  return [typeof notes === "string" ? notes : null, outcome ? `Outcome: ${String(outcome).replace(/_/g, " ")}` : null]
    .filter(Boolean)
    .join(" · ") || "No notes recorded.";
}

/** Who performed this action — only follow-ups have a resolvable actor. */
function entryActor(entry: TimelineEntry): string | null {
  if (entry.entry_type !== "follow_up") return null;
  const name = entry.data.provider_full_name;
  return typeof name === "string" ? name : null;
}

export default function FollowUpHistory() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    Promise.all([api.getPatientDetail(patientId), api.getTimeline(patientId)])
      .then(([d, t]) => {
        setData(d);
        setEntries(t);
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

  const filteredEntries = entries.filter((e) => {
    if (filter === "provider") return e.entry_type === "follow_up";
    if (filter === "check_ins") return e.entry_type === "check_in";
    return true;
  });
  const followUpCount = entries.filter((e) => e.entry_type === "follow_up").length;
  const mostRecent = entries[0];
  // Entries are already sorted newest-first by the backend, so the first
  // follow-up entry with a next_action_date is the current one.
  const nextFollowUpDate = entries.find(
    (e) => e.entry_type === "follow_up" && typeof e.data.next_action_date === "string",
  )?.data.next_action_date as string | undefined;

  return (
    <Box sx={{ p: 4, maxWidth: 800 }}>
      <Typography variant="h1" gutterBottom>
        Follow-up History
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {data.patient.name} · {data.patient.id} · Complete record of provider actions for this patient
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h3">{data.patient.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {followUpCount} follow-up record{followUpCount === 1 ? "" : "s"}
              {mostRecent ? ` · Last activity ${formatDateTime(mostRecent.occurred_at)}` : ""}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {nextFollowUpDate && (
              <Typography variant="body2" color="text.secondary">
                Next follow-up{" "}
                {new Date(nextFollowUpDate).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </Typography>
            )}
            <RiskBadge level={data.riskLevel} />
            <Box className="no-print" sx={{ display: "flex", gap: 1.5 }}>
              <Button variant="contained" onClick={() => navigate(`/provider/patients/${data.patient.id}/follow-up`)}>
                Add Follow-up
              </Button>
              <Button variant="outlined" color="secondary" onClick={() => window.print()}>
                Export as PDF
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>

      <Box className="no-print" sx={{ display: "flex", gap: 1, mb: 2 }}>
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="small"
            variant={filter === f.value ? "contained" : "outlined"}
            color="secondary"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </Box>

      <Typography variant="h3" sx={{ mb: 1.5 }}>
        Chronological timeline
      </Typography>

      {filteredEntries.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No follow-up actions have been recorded yet.
          </Typography>
        </Paper>
      ) : (
        filteredEntries.map((entry, i) => {
          // Alert entries carry their own id; follow-up entries carry the
          // alert_id they were recorded against. Check-ins aren't tied to
          // a specific alert, so they get no link.
          const alertId =
            entry.entry_type === "alert"
              ? (entry.data.id as string | undefined)
              : entry.entry_type === "follow_up"
                ? (entry.data.alert_id as string | undefined)
                : undefined;
          const actor = entryActor(entry);
          return (
            <Paper key={`${entry.entry_type}-${String(entry.data.id ?? i)}`} variant="outlined" sx={{ p: 2.5, mb: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {formatDateTime(entry.occurred_at)}
                </Typography>
                <Box sx={{ textAlign: "right" }}>
                  {actor && (
                    <Typography variant="caption" sx={{ display: "block", fontWeight: 600 }}>
                      {actor}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                    {entry.entry_type.replace("_", " ")}
                  </Typography>
                </Box>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {entryTitle(entry)}
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {entryDetail(entry)}
                </Typography>
                {alertId && (
                  <Button
                    className="no-print"
                    size="small"
                    onClick={() => navigate(`/provider/patients/${data.patient.id}/risk-review`)}
                    sx={{ flexShrink: 0 }}
                  >
                    View alert
                  </Button>
                )}
              </Box>
            </Paper>
          );
        })
      )}
    </Box>
  );
}
