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
import { contactDisplayName, listContacts } from "../api/contacts";
import type { ContactSummary } from "../api/types";
import ContactFormDialog from "../components/ContactFormDialog";
import EmptyState from "../components/EmptyState";

export default function ContactsList() {
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const rows = await listContacts({
          q: search.trim() || undefined,
          page_size: 200,
        });
        setContacts(rows);
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
          Contactos
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Nuevo contacto
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Buscar nombre o email"
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
      ) : contacts.length === 0 ? (
        <EmptyState
          title="Sin contactos"
          description="Crea contactos manualmente o impórtalos desde un CSV."
        />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Cargo</TableCell>
                <TableCell>Empresas</TableCell>
                <TableCell>Owner</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                >
                  <TableCell>{contactDisplayName(contact)}</TableCell>
                  <TableCell>{contact.email ?? "—"}</TableCell>
                  <TableCell>{contact.job_title ?? "—"}</TableCell>
                  <TableCell>
                    {contact.organizations
                      .map((org) => org.organization_name)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell>{contact.owner ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <ContactFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void refresh()}
      />
    </Box>
  );
}
