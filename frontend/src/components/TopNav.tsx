import { AppBar, Box, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import GlobalSearch from "./GlobalSearch";

const TABS: Array<{ label: string; path: string; matches: string[] }> = [
  { label: "Dashboard", path: "/", matches: ["/"] },
  { label: "Pipeline", path: "/pipeline", matches: ["/pipeline"] },
  { label: "Deals", path: "/deals", matches: ["/deals", "/deals/:id"] },
  { label: "Contactos", path: "/contacts", matches: ["/contacts", "/contacts/:id"] },
  {
    label: "Empresas",
    path: "/organizations",
    matches: ["/organizations", "/organizations/:id"],
  },
  { label: "Productos", path: "/products", matches: ["/products"] },
  { label: "Actividades", path: "/activities", matches: ["/activities"] },
  { label: "Reportes", path: "/reports", matches: ["/reports"] },
  { label: "Ajustes", path: "/settings", matches: ["/settings"] },
];

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeIndex = TABS.findIndex((tab) =>
    tab.matches.some((pattern) =>
      matchPath({ path: pattern, end: pattern === "/" }, location.pathname),
    ),
  );

  return (
    <AppBar position="sticky" color="primary" elevation={0}>
      <Toolbar>
        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ mr: 4, letterSpacing: 0.5, cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          CRM OS
        </Typography>
        <Tabs
          value={activeIndex < 0 ? false : activeIndex}
          textColor="inherit"
          TabIndicatorProps={{ sx: { backgroundColor: "white" } }}
        >
          {TABS.map((tab) => (
            <Tab
              key={tab.path}
              label={tab.label}
              onClick={() => navigate(tab.path)}
              sx={{ textTransform: "none", fontWeight: 600 }}
            />
          ))}
        </Tabs>
        <Box sx={{ flex: 1 }} />
        <GlobalSearch />
      </Toolbar>
    </AppBar>
  );
}
