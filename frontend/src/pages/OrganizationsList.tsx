import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { listOrganizations } from "../api/organizations";
import type { OrganizationSummary } from "../api/types";
import EmptyState from "../components/EmptyState";
import OrganizationFormDialog from "../components/OrganizationFormDialog";
import { formatMoney } from "../utils/format";

export default function OrganizationsList() {
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const rows = await listOrganizations({
          q: search.trim() || undefined,
          page_size: 200,
        });
        setOrgs(rows);
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5" fontWeight={700}>
          Empresas
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Nueva empresa
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Buscar nombre o dominio"
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          fullWidth
        />
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : orgs.length === 0 ? (
        <EmptyState
          title="Sin empresas"
          description="Crea empresas manualmente o impórtalas desde un CSV."
        />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Industria</TableCell>
                <TableCell>Dominio</TableCell>
                <TableCell>Contactos</TableCell>
                <TableCell>Deals abiertos</TableCell>
                <TableCell>Pipeline</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orgs.map((org) => (
                <TableRow
                  key={org.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/organizations/${org.id}`)}
                >
                  <TableCell>{org.name}</TableCell>
                  <TableCell>{org.industry ?? "—"}</TableCell>
                  <TableCell>{org.domain ?? "—"}</TableCell>
                  <TableCell>{org.contacts_count}</TableCell>
                  <TableCell>{org.open_deals_count}</TableCell>
                  <TableCell>
                    {Object.entries(org.open_deals_value)
                      .map(([currency, cents]) => formatMoney(cents, currency))
                      .join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <OrganizationFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void refresh()}
      />
    </Box>
  );
}
