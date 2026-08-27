import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { api, ApiError } from "../../lib/providerApi";
import { setProviderSession } from "../../lib/providerSessionStore";

type Mode = "sign-in" | "forgot-password";

export default function ProviderSignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const sessionExpired = searchParams.get("expired") === "1";

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      setError("Enter your work email and password to continue.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { access_token, refresh_token, expires_at, provider } = await api.signIn(
        email.trim(),
        password,
      );
      setProviderSession(
        {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: expires_at,
          provider,
        },
        rememberPassword,
      );
      navigate("/provider");
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

  function openForgotPassword() {
    setMode("forgot-password");
    setError(null);
    setResetSent(false);
  }

  function backToSignIn() {
    setMode("sign-in");
    setError(null);
    setResetSent(false);
  }

  async function handleRequestReset() {
    if (!email.trim()) {
      setError("Enter your work email to receive a reset link.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.requestPasswordReset(email.trim());
      setResetSent(true);
    } catch (e) {
      // requestPasswordReset never throws on a "no such account" case
      // (the backend responds with the same generic message either way)
      // — an error here means the request itself failed, e.g. the
      // backend is unreachable.
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex" }}>
      <Box
        sx={{
          flex: 1,
          backgroundColor: "#1A1C1E",
          color: "#fff",
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          px: 8,
        }}
      >
        <Typography variant="overline" sx={{ opacity: 0.6, mb: 2 }}>
          CarePulse AI
        </Typography>
        <Typography variant="h1" sx={{ maxWidth: 420, mb: 3 }}>
          Better follow-up starts with clearer signals.
        </Typography>
        <Typography sx={{ maxWidth: 420, opacity: 0.75, mb: 5 }}>
          Review patient-reported adherence, blood-pressure readings and
          follow-up activity from one provider workspace.
        </Typography>
        <Box sx={{ border: "1px solid rgba(255,255,255,0.2)", borderRadius: 1, p: 2, maxWidth: 380 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Clinical safety
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            All alerts require provider review. No diagnosis or triage decision is automated.
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "background.paper",
          px: 3,
        }}
      >
        <Box sx={{ maxWidth: 360, width: "100%" }}>
          {mode === "sign-in" ? (
            <>
              <Typography variant="h2" gutterBottom>
                Welcome back
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Sign in to the healthcare provider dashboard.
              </Typography>

              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Work email
              </Typography>
              <TextField
                fullWidth
                slotProps={{ htmlInput: { "aria-label": "Work email" } }}
                placeholder="anjali.silva@clinic.lk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ mb: 2 }}
              />

              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Password
              </Typography>
              <TextField
                fullWidth
                slotProps={{
                  htmlInput: { "aria-label": "Password" },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          edge="end"
                        >
                          <Typography variant="caption">{showPassword ? "Hide" : "Show"}</Typography>
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ mb: 1 }}
              />
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={rememberPassword}
                      onChange={(e) => setRememberPassword(e.target.checked)}
                    />
                  }
                  label="Remember password"
                />
                <Link component="button" variant="body2" underline="hover" onClick={openForgotPassword}>
                  Forgot Password?
                </Link>
              </Box>

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleSignIn}
                disabled={loading}
                sx={{ mb: 2 }}
              >
                Sign In
              </Button>

              <Box sx={{ border: "1px dashed #C9CCD1", borderRadius: 1, p: 2, minHeight: 44, mb: 1 }}>
                <Typography variant="body2" color={error ? "error" : "text.secondary"}>
                  {error ??
                    (sessionExpired
                      ? "Your session has expired. Please sign in again."
                      : "Error / validation messages appear here.")}
                </Typography>
              </Box>

              <Typography variant="caption" color="text.secondary">
                Access is restricted to registered clinical staff.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="h2" gutterBottom>
                Reset your password
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Enter your work email and we'll send you a link to reset your password.
              </Typography>

              {resetSent ? (
                <Box sx={{ border: "1px solid #C9CCD1", borderRadius: 1, p: 2, mb: 2 }}>
                  <Typography variant="body2">
                    If an account exists for that email, a password reset link has been sent.
                    Check your inbox and follow the link to set a new password.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Work email
                  </Typography>
                  <TextField
                    fullWidth
                    slotProps={{ htmlInput: { "aria-label": "Work email" } }}
                    placeholder="anjali.silva@clinic.lk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    sx={{ mb: 2 }}
                  />

                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={handleRequestReset}
                    disabled={loading}
                    sx={{ mb: 2 }}
                  >
                    Send Reset Link
                  </Button>

                  <Box sx={{ border: "1px dashed #C9CCD1", borderRadius: 1, p: 2, minHeight: 44, mb: 1 }}>
                    <Typography variant="body2" color={error ? "error" : "text.secondary"}>
                      {error ?? "Error / validation messages appear here."}
                    </Typography>
                  </Box>
                </>
              )}

              <Link component="button" variant="body2" underline="hover" onClick={backToSignIn}>
                Back to sign in
              </Link>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
