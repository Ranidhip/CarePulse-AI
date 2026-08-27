import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { BPTrendPoint } from "../lib/providerApi";

/**
 * Hand-rolled inline SVG line chart — deliberately not a charting library.
 * This app avoids adding new dependencies it can't verify install/render
 * correctly in this environment (see apps/mobile/src/components/BottomNav.tsx
 * for the same policy on the mobile side); a BP trend is just two
 * polylines over time, simple enough to not need one.
 */
export default function BPTrendChart({ readings }: { readings: BPTrendPoint[] }) {
  if (readings.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No blood-pressure readings recorded yet.
      </Typography>
    );
  }

  const width = 640;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = readings.flatMap((r) => [r.systolic, r.diastolic]);
  const minY = Math.min(40, ...allValues) - 10;
  const maxY = Math.max(180, ...allValues) + 10;

  const x = (i: number) =>
    readings.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (i / (readings.length - 1)) * plotWidth;
  const y = (value: number) =>
    padding.top + plotHeight - ((value - minY) / (maxY - minY)) * plotHeight;

  const systolicPoints = readings.map((r, i) => `${x(i)},${y(r.systolic)}`).join(" ");
  const diastolicPoints = readings.map((r, i) => `${x(i)},${y(r.diastolic)}`).join(" ");

  const hypertensionSystolicY = y(140);
  const hypertensionDiastolicY = y(90);

  const firstLabel = new Date(readings[0].measuredAt).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
  const lastLabel = new Date(readings[readings.length - 1].measuredAt).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
        <Legend color="#B3261E" label="Systolic" />
        <Legend color="#1A5FB4" label="Diastolic" />
        <Legend color="#C9CCD1" label="140/90 reference" dashed />
      </Box>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Blood pressure trend over time"
      >
        {/* Hypertension reference lines (140 systolic / 90 diastolic) */}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={hypertensionSystolicY}
          y2={hypertensionSystolicY}
          stroke="#C9CCD1"
          strokeDasharray="4 4"
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={hypertensionDiastolicY}
          y2={hypertensionDiastolicY}
          stroke="#C9CCD1"
          strokeDasharray="4 4"
        />
        {/* Axis */}
        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
          stroke="#8A8F98"
        />
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="#8A8F98"
        />
        <polyline points={systolicPoints} fill="none" stroke="#B3261E" strokeWidth={2} />
        <polyline points={diastolicPoints} fill="none" stroke="#1A5FB4" strokeWidth={2} />
        {readings.map((r, i) => (
          <g key={r.id}>
            <circle cx={x(i)} cy={y(r.systolic)} r={3} fill="#B3261E" />
            <circle cx={x(i)} cy={y(r.diastolic)} r={3} fill="#1A5FB4" />
          </g>
        ))}
        <text x={padding.left} y={height - 6} fontSize={11} fill="#5C6570">
          {firstLabel}
        </text>
        <text x={width - padding.right} y={height - 6} fontSize={11} fill="#5C6570" textAnchor="end">
          {lastLabel}
        </text>
      </svg>
    </Box>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Box
        sx={{
          width: 16,
          height: 0,
          borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}
