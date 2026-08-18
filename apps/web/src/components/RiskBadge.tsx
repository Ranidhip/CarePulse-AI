import Chip from "@mui/material/Chip";
import type { RiskLevel } from "../types";
import { riskColors } from "../theme";

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const c = riskColors[level];
  return (
    <Chip
      label={level === "pending" ? "Pending review" : `${c.label} risk`}
      sx={{
        backgroundColor: c.bg,
        color: c.fg,
        fontWeight: 700,
        border: `1px solid ${c.fg}33`,
      }}
      size="small"
    />
  );
}
