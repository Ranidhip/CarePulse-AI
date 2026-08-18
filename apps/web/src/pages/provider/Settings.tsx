import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function Settings() {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h1" gutterBottom>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Account and clinic settings aren't part of this prototype's demo workflow.
      </Typography>
    </Box>
  );
}
