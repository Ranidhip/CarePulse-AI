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
import type { DashboardSummary, QueueRow, RiskLevel } from "../../types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const RISK_SORT: Record<RiskLevel, number> = { high: 0, medium: 1, pending: 2, low: 3 };

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getDashboardSummary(), api.getPatients()])
      .then(([s, r]) => {
        if (cancelled) return;
        setSummary(s);
        setRows(r);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load dashboard."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const unresolvedAlerts = useMemo(
    () => rows.filter((r) => r.alertStatus === "New" || r.alertStatus === "In Progress").length,
    [rows]
  );

  const filteredRows = useMemo(() => {
    let result = rows;
    if (alertsOnly) {
      result = result.filter((r) => r.alertStatus === "New" || r.alertStatus === "In Progress");
    }
    if (riskFilter !== "all") {
      result = result.filter((r) => r.riskLevel === riskFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => RISK_SORT[a.riskLevel] - RISK_SORT[b.riskLevel]);
  }, [rows, riskFilter, search, alertsOnly]);

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
        Review patient-reported adherence, blood-pressure readings and follow-up alerts.
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, mb: 4 }}>
        <MetricCard label="High Risk" value={summary?.highRisk ?? 0} accent="#B3261E" />
        <MetricCard label="Medium Risk" value={summary?.mediumRisk ?? 0} accent="#8A6D00" />
        <MetricCard label="Pending Review" value={summary?.pendingReview ?? 0} accent="#5C6570" />
        <MetricCard label="Unresolved Alerts" value={unresolvedAlerts} accent="#1A1C1E" />
      </Box>

      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: "flex", gap: 2, alignItems: "center" }}>
        <TextField
          placeholder="Search patient or patient ID"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1 }}
        />
        <Select
          size="small"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as "all" | RiskLevel)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">Risk: All</MenuItem>
          <MenuItem value="high">Risk: High</MenuItem>
          <MenuItem value="medium">Risk: Medium</MenuItem>
          <MenuItem value="low">Risk: Low</MenuItem>
          <MenuItem value="pending">Risk: Pending</MenuItem>
        </Select>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          Sort: Highest risk
        </Typography>
      </Paper>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Patient</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Main reason</TableCell>
              <TableCell>Last check-in</TableCell>
              <TableCell>Latest BP</TableCell>
              <TableCell>Alert status</TableCell>
              <TableCell>Risk</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow key={row.id} hover>
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
                <TableCell>
                  <RiskBadge level={row.riskLevel} />
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
                    No patients match the current filters.
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
