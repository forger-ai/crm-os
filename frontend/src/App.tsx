import { Box } from "@mui/material";
import { Navigate, Route, Routes } from "react-router-dom";
import TopNav from "./components/TopNav";
import ActivitiesList from "./pages/ActivitiesList";
import ContactDetail from "./pages/ContactDetail";
import ContactsList from "./pages/ContactsList";
import Dashboard from "./pages/Dashboard";
import DealDetail from "./pages/DealDetail";
import DealsList from "./pages/DealsList";
import OrganizationDetail from "./pages/OrganizationDetail";
import OrganizationsList from "./pages/OrganizationsList";
import PipelineBoard from "./pages/PipelineBoard";
import ProductsList from "./pages/ProductsList";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { useLeadPolling } from "./hooks/useLeadPolling";

export default function App() {
  useLeadPolling();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
      }}
    >
      <TopNav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pipeline" element={<PipelineBoard />} />
        <Route path="/deals" element={<DealsList />} />
        <Route path="/deals/:id" element={<DealDetail />} />
        <Route path="/contacts" element={<ContactsList />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/organizations" element={<OrganizationsList />} />
        <Route path="/organizations/:id" element={<OrganizationDetail />} />
        <Route path="/activities" element={<ActivitiesList />} />
        <Route path="/products" element={<ProductsList />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Box>
  );
}
