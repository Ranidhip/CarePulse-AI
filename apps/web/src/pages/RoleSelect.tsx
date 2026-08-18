import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

export default function RoleSelect() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        backgroundColor: "background.default",
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 420, width: "100%" }} variant="outlined">
        <Typography variant="h1" gutterBottom>
          CarePulse AI
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Hypertension medication-adherence decision-support prototype.
        </Typography>

        <Stack spacing={2}>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate("/patient")}
          >
            Continue as Patient
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => navigate("/provider")}
          >
            Continue as Healthcare Provider
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          Educational prototype only. This system does not diagnose, prescribe,
          or replace professional medical judgement.
        </Typography>
      </Paper>
    </Box>
  );
}
