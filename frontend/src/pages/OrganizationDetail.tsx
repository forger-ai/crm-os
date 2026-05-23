import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LinkIcon from "@mui/icons-material/AddLink";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { useNavigate, useParams } from "react-router-dom";
import {
  completeActivity,
  deleteActivity,
  listActivities,
} from "../api/activities";
import { contactDisplayName, listContacts } from "../api/contacts";
import {
  listCustomFields,
  upsertCustomFieldValues,
} from "../api/customFields";
import { createNote, deleteNote, listNotes, patchNote } from "../api/notes";
import {
  getOrganization,
  linkContactToOrganization,
  unlinkContactFromOrganization,
} from "../api/organizations";
import type {
  ActivityRead,
  ContactSummary,
  CustomFieldDefRead,
  NoteRead,
  OrganizationRead,
} from "../api/types";
import ActivityFormDialog from "../components/ActivityFormDialog";
import ActivityRow from "../components/ActivityRow";
import CustomFieldEditor, {
  valuesFromCustomFieldReads,
} from "../components/CustomFieldEditor";
import NoteList from "../components/NoteList";
import OrganizationFormDialog from "../components/OrganizationFormDialog";
import { formatMoney } from "../utils/format";

type TabKey = "summary" | "activities" | "notes" | "custom";

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<OrganizationRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("summary");
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkContact, setLinkContact] = useState<ContactSummary | null>(null);
  const [linkRole, setLinkRole] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactSummary[]>([]);
  const [activities, setActivities] = useState<ActivityRead[]>([]);
  const [notes, setNotes] = useState<NoteRead[]>([]);
  const [customDefs, setCustomDefs] = useState<CustomFieldDefRead[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [fresh, freshActivities, freshNotes] = await Promise.all([
        getOrganization(id),
        listActivities({ organization_id: id, page_size: 200 }),
        listNotes({ organization_id: id }),
      ]);
      setOrg(fresh);
      setActivities(freshActivities);
      setNotes(freshNotes);
      setCustomValues(valuesFromCustomFieldReads(fresh.custom_fields));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la empresa");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listContacts({ page_size: 200 }).then(setContactOptions).catch(() => {});
    listCustomFields({ entity: "organization" })
      .then(setCustomDefs)
      .catch(() => setCustomDefs([]));
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (!org) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error ?? "Empresa no encontrada"}</Alert>
      </Box>
    );
  }

  const handleLink = async () => {
    if (!linkContact || !org) return;
    await linkContactToOrganization(org.id, {
      contact_id: linkContact.id,
      role: linkRole.trim() || null,
    });
    setLinkOpen(false);
    setLinkContact(null);
    setLinkRole("");
    await refresh();
  };

  const handleUnlink = async (contactId: string) => {
    if (!org) return;
    await unlinkContactFromOrganization(org.id, contactId);
    await refresh();
  };

  const handleNoteCreate = async (body: string) => {
    if (!org) return;
    await createNote({ body, organization_id: org.id });
    await refresh();
  };
  const handleTogglePin = async (note: NoteRead) => {
    await patchNote(note.id, { pinned: !note.pinned });
    await refresh();
  };
  const handleNoteDelete = async (note: NoteRead) => {
    await deleteNote(note.id);
    await refresh();
  };

  const handleSaveCustom = async () => {
    if (!org) return;
    const payload = Object.entries(customValues).map(([field_id, value]) => ({
      field_id,
      value,
    }));
    await upsertCustomFieldValues("organization", org.id, payload);
    await refresh();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate("/organizations")} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          {org.name}
        </Typography>
        <Button
          startIcon={<EditIcon />}
          variant="outlined"
          size="small"
          onClick={() => setEditOpen(true)}
        >
          Editar
        </Button>
      </Stack>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap", rowGap: 2 }}>
            <Field label="Industria" value={org.industry ?? "—"} />
            <Field label="Dominio" value={org.domain ?? "—"} />
            <Field label="Sitio" value={org.website ?? "—"} />
            <Field label="Teléfono" value={org.phone ?? "—"} />
            <Field label="Owner" value={org.owner ?? "—"} />
          </Stack>
          {org.address && (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              📍 {org.address}
            </Typography>
          )}
          {org.description && (
            <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
              {org.description}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 1 }}
          >
            <Typography variant="subtitle1" fontWeight={700}>
              Contactos
            </Typography>
            <Button
              startIcon={<LinkIcon />}
              size="small"
              onClick={() => setLinkOpen(true)}
            >
              Asociar contacto
            </Button>
          </Stack>
          {org.contacts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Aún sin contactos asociados.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {org.contacts.map((contact) => (
                <Stack
                  key={contact.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                >
                  <Chip
                    label={contactDisplayName(contact)}
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                    variant="outlined"
                  />
                  {contact.job_title && (
                    <Typography variant="caption" color="text.secondary">
                      {contact.job_title}
                    </Typography>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => handleUnlink(contact.id)}
                  >
                    <LinkOffIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Paper variant="outlined">
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value="summary" label={`Deals abiertos (${org.open_deals.length})`} />
          <Tab value="activities" label={`Actividades (${activities.length})`} />
          <Tab value="notes" label={`Notas (${notes.length})`} />
          <Tab value="custom" label="Campos custom" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === "summary" &&
            (org.open_deals.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin deals abiertos.
              </Typography>
            ) : (
              <List dense disablePadding>
                {org.open_deals.map((deal) => (
                  <ListItemButton
                    key={deal.id}
                    onClick={() => navigate(`/deals/${deal.id}`)}
                  >
                    <ListItemText
                      primary={deal.title}
                      secondary={`${deal.stage_name} · ${formatMoney(deal.amount_cents, deal.currency)}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            ))}
          {tab === "activities" && (
            <Stack spacing={1}>
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setActivityOpen(true)}
                >
                  Nueva actividad
                </Button>
              </Box>
              {activities.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin actividades.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {activities.map((activity) => (
                    <ActivityRow
                      key={activity.id}
                      activity={activity}
                      onComplete={async () => {
                        await completeActivity(activity.id);
                        await refresh();
                      }}
                      onDelete={async () => {
                        await deleteActivity(activity.id);
                        await refresh();
                      }}
                    />
                  ))}
                </List>
              )}
            </Stack>
          )}
          {tab === "notes" && (
            <NoteList
              notes={notes}
              onCreate={handleNoteCreate}
              onTogglePin={handleTogglePin}
              onDelete={handleNoteDelete}
            />
          )}
          {tab === "custom" && (
            <Stack spacing={2}>
              {customDefs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No hay campos custom para empresas. Configúralos en Ajustes.
                </Typography>
              ) : (
                <>
                  <CustomFieldEditor
                    definitions={customDefs}
                    values={customValues}
                    onChange={(key, value) =>
                      setCustomValues((prev) => ({ ...prev, [key]: value }))
                    }
                  />
                  <Box>
                    <Button variant="contained" size="small" onClick={handleSaveCustom}>
                      Guardar
                    </Button>
                  </Box>
                </>
              )}
            </Stack>
          )}
        </Box>
      </Paper>

      <OrganizationFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialOrganization={org}
        onSaved={() => void refresh()}
      />
      <ActivityFormDialog
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        defaultOrganizationId={org.id}
        onSaved={() => void refresh()}
      />
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Asociar contacto</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              size="small"
              options={contactOptions}
              getOptionLabel={(c) => contactDisplayName(c)}
              value={linkContact}
              onChange={(_, next) => setLinkContact(next)}
              renderInput={(params) => <TextField {...params} label="Contacto" />}
            />
            <TextField
              size="small"
              label="Rol"
              value={linkRole}
              onChange={(event) => setLinkRole(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleLink} disabled={!linkContact}>
            Asociar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 140 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}
