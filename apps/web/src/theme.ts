import { createTheme } from "@mui/material/styles";

/**
 * Clean, grayscale-first theme matching the CarePulse wireframes.
 * Color is used sparingly (risk badges only) and never as the sole
 * indicator of meaning — badges always pair color with text/icon.
 * No gradients, no decorative imagery, per design requirements.
 */
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2B2F33",
    },
    secondary: {
      main: "#5C6570",
    },
    background: {
      default: "#F5F5F5",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1C1E",
      secondary: "#5C6570",
    },
    error: { main: "#B3261E" },
    warning: { main: "#8A6D00" },
    success: { main: "#1E6B3C" },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "Helvetica",
      "Arial",
      "sans-serif",
    ].join(","),
    h1: { fontSize: "1.75rem", fontWeight: 700 },
    h2: { fontSize: "1.4rem", fontWeight: 700 },
    h3: { fontSize: "1.15rem", fontWeight: 600 },
    body1: { fontSize: "1rem" },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
  },
});

export const riskColors: Record<"low" | "medium" | "high" | "pending", { bg: string; fg: string; label: string }> = {
  low: { bg: "#E4EFE7", fg: "#1E6B3C", label: "Low" },
  medium: { bg: "#FBF1D9", fg: "#8A6D00", label: "Medium" },
  high: { bg: "#F7E1DE", fg: "#B3261E", label: "High" },
  pending: { bg: "#EBEDEF", fg: "#5C6570", label: "Pending" },
};
