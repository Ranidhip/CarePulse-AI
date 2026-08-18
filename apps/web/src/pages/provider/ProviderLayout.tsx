import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import { getProviderSession, clearProviderSession } from "../../lib/providerSession";
import type { ProviderProfile } from "../../types";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/provider" },
  { label: "Alerts", path: "/provider/alerts" },
  { label: "Patients", path: "/provider/patients" },
  { label: "Settings", path: "/provider/settings" },
];

export default function ProviderLayout() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState<ProviderProfile | null>(null);

  useEffect(() => {
    const session = getProviderSession();
    setProvider(session?.provider ?? null);
  }, []);

  function handleSignOut() {
    clearProviderSession();
    navigate("/provider/sign-in");
  }

  const initials = provider
    ? provider.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
    : "";

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Box
        component="nav"
        sx={{
          width: 220,
          flexShrink: 0,
          backgroundColor: "#1A1C1E",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          p: 2,
        }}
      >
        <Typography variant="h3" sx={{ mb: 3, color: "#fff" }}>
          CarePulse AI
        </Typography>

        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <Box component="li" key={item.path} sx={{ mb: 0.5 }}>
              <NavLink
                to={item.path}
                end={item.path === "/provider"}
                style={({ isActive }) => ({
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: 6,
                  textDecoration: "none",
                  color: "#fff",
                  backgroundColor: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 14,
                })}
              >
                {item.label}
              </NavLink>
            </Box>
          ))}
        </Box>

        <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.15)", pt: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: "#fff" }}>
            {provider?.name ?? "—"}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.6, display: "block", mb: 1 }}>
            {provider?.clinic ?? ""}
          </Typography>
          <Link component="button" variant="caption" onClick={handleSignOut} sx={{ color: "#fff" }}>
            Sign out
          </Link>
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 1.5,
            px: 3,
            py: 1.5,
            borderBottom: "1px solid #E0E0E0",
            backgroundColor: "background.paper",
          }}
        >
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              backgroundColor: "#EBEDEF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {initials}
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {provider?.name ?? ""}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Healthcare Provider
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1, backgroundColor: "background.default", overflow: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
