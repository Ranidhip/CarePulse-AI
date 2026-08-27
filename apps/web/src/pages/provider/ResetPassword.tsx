import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { api, ApiError } from "../../lib/providerApi";

/**
 * Landing page for the link in Supabase Auth's password-recovery email
 * (see POST /auth/forgot-password's redirect_to). Supabase's default
 * recovery flow appends the short-lived recovery session as a URL hash
 * fragment — #access_token=...&type=recovery&... — never as a query
 * string, so it's read from window.location.hash, not useSearchParams.
 */
function parseAccessTokenFromHash(): string | null {
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(raw).get("access_token");
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [accessToken] = useState<string | null>(() => parseAccessTokenFromHash());
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!accessToken) {
      setError("This reset link is invalid or has expired. Request a new one.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.resetPassword(accessToken, newPassword);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "background.paper",
        px: 3,
      }}
    >
      <Box sx={{ maxWidth: 360, width: "100%" }}>
        <Typography variant="h2" gutterBottom>
          Set a new password
        </Typography>

        {done ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Your password has been updated. Sign in with your new password.
            </Typography>
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={() => navigate("/provider/sign-in")}
            >
              Back to Sign In
            </Button>
          </>
        ) : !accessToken ? (
          <>
            <Typography variant="body2" color="error" sx={{ mb: 3 }}>
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </Typography>
            <Button
              fullWidth
              variant="outlined"
              color="secondary"
              onClick={() => navigate("/provider/sign-in")}
            >
              Back to Sign In
            </Button>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              Choose a new password for your account.
            </Typography>

            <Typography variant="body2" sx={{ mb: 0.5 }}>
              New password
            </Typography>
            <TextField
              fullWidth
              type="password"
              slotProps={{ htmlInput: { "aria-label": "New password" } }}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Confirm new password
            </Typography>
            <TextField
              fullWidth
              type="password"
              slotProps={{ htmlInput: { "aria-label": "Confirm new password" } }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleSubmit}
              disabled={loading}
              sx={{ mb: 2 }}
            >
              Set New Password
            </Button>

            <Box sx={{ border: "1px dashed #C9CCD1", borderRadius: 1, p: 2, minHeight: 44 }}>
              <Typography variant="body2" color={error ? "error" : "text.secondary"}>
                {error ?? "Error / validation messages appear here."}
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
