import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import RiskBadge from "../../components/RiskBadge";
import { api } from "../../lib/providerApi";
import type { AlertStatus, DashboardSummary, QueueRow, RiskLevel } from "../../types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short", year: "numeric" }) +
    " · Last synchronised " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const RISK_SORT: Record<RiskLevel, number> = { high: 0, medium: 1, pending: 2, low: 3 };
const OPEN_STATUSES: AlertStatus[] = ["New", "In Progress"];

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportRowsAsCSV(rows: QueueRow[]) {
  const header = ["Patient", "Age", "Risk", "Main reason", "Last check-in", "Latest BP", "Alert status"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.name, String(r.age), r.riskLevel, r.mainReason, r.lastCheckInDate ?? "", r.latestBP ?? "", r.alertStatus]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `carepulse-patients-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard({
  title = "Priority Dashboard",
  defaultFilter = "all",
  alertsOnly = false,
}: {
  title?: string;
  defaultFilter?: "all" | RiskLevel;
  alertsOnly?: boolean;
}) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>(defaultFilter);
  const [openOnly, setOpenOnly] = useState(alertsOnly);
  const [dateFilter, setDateFilter] = useState<"all" | "7" | "30">("all");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getDashboardSummary(), api.getPatients()])
      .then(([s, r]) => {
        if (cancelled) return;
        setSummary(s);
        setRows(r);
        setLastSynced(new Date());
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load dashboard."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (openOnly) {
      result = result.filter((r) => OPEN_STATUSES.includes(r.alertStatus));
    }
    if (riskFilter !== "all") {
      result = result.filter((r) => r.riskLevel === riskFilter);
    }
    if (dateFilter !== "all") {
      const days = dateFilter === "7" ? 7 : 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      result = result.filter((r) => r.lastCheckInDate && new Date(r.lastCheckInDate).getTime() >= cutoff);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => RISK_SORT[a.riskLevel] - RISK_SORT[b.riskLevel]);
  }, [rows, riskFilter, openOnly, dateFilter, search]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h1" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {lastSynced ? formatDateTime(lastSynced) : "Review patient-reported adherence and follow-up activity."}
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, mb: 4 }}>
        <MetricCard label="High Risk" value={summary?.highRisk ?? 0} accent="#B3261E" />
        <MetricCard label="Medium Risk" value={summary?.mediumRisk ?? 0} accent="#8A6D00" />
        <MetricCard label="Pending Review" value={summary?.pendingReview ?? 0} accent="#5C6570" />
        <MetricCard label="Check-ins This Week" value={summary?.checkInsThisWeek ?? 0} accent="#1A1C1E" />
      </Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            placeholder="Search patients by name"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }}
          />
          <Select
            size="small"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as "all" | RiskLevel)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="all">Risk: All</MenuItem>
            <MenuItem value="high">Risk: High</MenuItem>
            <MenuItem value="medium">Risk: Medium</MenuItem>
            <MenuItem value="low">Risk: Low</MenuItem>
            <MenuItem value="pending">Risk: Pending</MenuItem>
          </Select>
          <Button
            variant={openOnly ? "contained" : "outlined"}
            color="secondary"
            size="small"
            onClick={() => setOpenOnly((v) => !v)}
          >
            Status: {openOnly ? "Open" : "All"}
          </Button>
          <Select
            size="small"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as "all" | "7" | "30")}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">All time</MenuItem>
            <MenuItem value="7">Last 7 days</MenuItem>
            <MenuItem value="30">Last 30 days</MenuItem>
          </Select>
          <Button variant="outlined" color="secondary" size="small" onClick={() => exportRowsAsCSV(filteredRows)}>
            Export list
          </Button>
        </Box>
      </Paper>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Risk</TableCell>
              <TableCell>Patient</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Main features</TableCell>
              <TableCell>Latest check-in</TableCell>
              <TableCell>Latest BP</TableCell>
              <TableCell>Alert status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>
                  <RiskBadge level={row.riskLevel} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.name}
                  </Typography>
                </TableCell>
                <TableCell>{row.age}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {row.mainReason}
                  </Typography>
                </TableCell>
                <TableCell>{formatDate(row.lastCheckInDate)}</TableCell>
                <TableCell>{row.latestBP ?? "—"}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {row.alertStatus}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => navigate(`/provider/patients/${row.id}`)}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
                    No patients require review right now.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderTop: `3px solid ${accent}` }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h1" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
    </Paper>
  );
}
