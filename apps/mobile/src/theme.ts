/**
 * Plain design tokens — no MUI in this app per requirements. Mirrors the
 * grayscale palette used in apps/web/src/theme.ts so the two clients look
 * like the same product.
 */

export const colors = {
  background: "#F5F5F5",
  surface: "#FFFFFF",
  card: "#FAFAFA",
  border: "#E0E0E0",
  borderDashed: "#C9CCD1",
  textPrimary: "#1A1C1E",
  textSecondary: "#5C6570",
  primary: "#2B2F33",
  secondary: "#5C6570",
  error: "#B3261E",
  warning: "#8A6D00",
  success: "#1E6B3C",
};

export const riskColors: Record<"low" | "medium" | "high", { bg: string; fg: string; label: string }> = {
  low: { bg: "#E4EFE7", fg: colors.success, label: "Low" },
  medium: { bg: "#FBF1D9", fg: colors.warning, label: "Medium" },
  high: { bg: "#F7E1DE", fg: colors.error, label: "High" },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = 6;

export const fontSizes = {
  h1: 26,
  h2: 20,
  h3: 17,
  body: 16,
  caption: 13,
};

/** Minimum touch target, per accessibility requirement. */
export const MIN_TOUCH = 44;
