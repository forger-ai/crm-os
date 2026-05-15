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
import { completeActivity, deleteActivity, listActivities } from "../api/activities";
import { contactDisplayName, getContact } from "../api/contacts";
import {
  listCustomFields,
  upsertCustomFieldValues,
} from "../api/customFields";
import { createNote, deleteNote, listNotes, patchNote } from "../api/notes";
import {
  linkContactToOrganization,
  listOrganizations,
  unlinkContactFromOrganization,
} from "../api/organizations";
import type {
  ActivityRead,
  ContactRead,
  CustomFieldDefRead,
  NoteRead,
  OrganizationSummary,
} from "../api/types";
import ActivityFormDialog from "../components/ActivityFormDialog";
import ActivityRow from "../components/ActivityRow";
import ContactFormDialog from "../components/ContactFormDialog";
import CustomFieldEditor, {
  valuesFromCustomFieldReads,
} from "../components/CustomFieldEditor";
import EmailComposeDialog from "../components/EmailComposeDialog";
import NoteList from "../components/NoteList";
import { formatMoney } from "../utils/format";

type TabKey = "summary" | "activities" | "notes" | "custom";

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<ContactRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("summary");
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkOrg, setLinkOrg] = useState<OrganizationSummary | null>(null);
  const [linkRole, setLinkRole] = useState("");
  const [activities, setActivities] = useState<ActivityRead[]>([]);
  const [notes, setNotes] = useState<NoteRead[]>([]);
  const [orgOptions, setOrgOptions] = useState<OrganizationSummary[]>([]);
  const [customDefs, setCustomDefs] = useState<CustomFieldDefRead[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [fresh, freshActivities, freshNotes] = await Promise.all([
        getContact(id),
        listActivities({ contact_id: id, page_size: 200 }),
        listNotes({ contact_id: id }),
      ]);
      setContact(fresh);
      setActivities(freshActivities);
      setNotes(freshNotes);
      setCustomValues(valuesFromCustomFieldReads(fresh.custom_fields));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el contacto");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listOrganizations({ page_size: 200 }).then(setOrgOptions).catch(() => {});
    listCustomFields({ entity: "contact" })
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
  if (!contact) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error ?? "Contacto no encontrado"}</Alert>
      </Box>
    );
  }

  const handleLink = async () => {
    if (!linkOrg || !contact) return;
    await linkContactToOrganization(linkOrg.id, {
      contact_id: contact.id,
      role: linkRole.trim() || null,
    });
    setLinkOpen(false);
    setLinkOrg(null);
    setLinkRole("");
    await refresh();
  };

  const handleUnlink = async (organizationId: string) => {
    if (!contact) return;
    await unlinkContactFromOrganization(organizationId, contact.id);
    await refresh();
  };

  const handleNoteCreate = async (body: string) => {
    if (!contact) return;
    await createNote({ body, contact_id: contact.id });
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
    if (!contact) return;
    const payload = Object.entries(customValues).map(([field_id, value]) => ({
      field_id,
      value,
    }));
    await upsertCustomFieldValues("contact", contact.id, payload);
    await refresh();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate("/contacts")} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          {contactDisplayName(contact)}
        </Typography>
        <Button
          startIcon={<EditIcon />}
          variant="outlined"
          size="small"
          onClick={() => setEditOpen(true)}
        >
          Editar
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setComposeOpen(true)}
          disabled={!contact.email}
        >
          Componer email
        </Button>
      </Stack>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap", rowGap: 2 }}>
            <Field label="Email" value={contact.email ?? "—"} />
            <Field label="Teléfono" value={contact.phone ?? "—"} />
            <Field label="Cargo" value={contact.job_title ?? "—"} />
            <Field label="Owner" value={contact.owner ?? "—"} />
          </Stack>
          {contact.description && (
            <Typography variant="body2" sx={{ mt: 2, whiteSpace: "pre-wrap" }}>
              {contact.description}
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
              Empresas
            </Typography>
            <Button
              startIcon={<LinkIcon />}
              size="small"
              onClick={() => setLinkOpen(true)}
            >
              Asociar empresa
            </Button>
          </Stack>
          {contact.organizations.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Aún no está asociado a ninguna empresa.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {contact.organizations.map((link) => (
                <Stack
                  key={link.organization_id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                >
                  <Chip
                    label={
                      link.is_primary
                        ? `${link.organization_name} (principal)`
                        : link.organization_name
                    }
                    onClick={() =>
                      navigate(`/organizations/${link.organization_id}`)
                    }
                    variant="outlined"
                  />
                  {link.role && (
                    <Typography variant="caption" color="text.secondary">
                      {link.role}
                    </Typography>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => handleUnlink(link.organization_id)}
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
          <Tab value="summary" label={`Deals abiertos (${contact.open_deals.length})`} />
          <Tab
            value="activities"
            label={`Actividades (${activities.length})`}
          />
          <Tab value="notes" label={`Notas (${notes.length})`} />
          <Tab value="custom" label="Campos custom" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === "summary" &&
            (contact.open_deals.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin deals abiertos asociados.
              </Typography>
            ) : (
              <List dense disablePadding>
                {contact.open_deals.map((deal) => (
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
                  No hay campos custom para contactos. Configúralos en Ajustes.
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

      <ContactFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialContact={contact}
        onSaved={() => void refresh()}
      />
      <ActivityFormDialog
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        defaultContactId={contact.id}
        onSaved={() => void refresh()}
      />
      <EmailComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        defaultContactId={contact.id}
        defaultTo={contact.email ?? ""}
        defaultOwner={contact.owner ?? undefined}
        contextLabel={`contacto ${contactDisplayName(contact)}`}
        onSaved={() => void refresh()}
      />
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Asociar empresa</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              size="small"
              options={orgOptions}
              getOptionLabel={(o) => o.name}
              value={linkOrg}
              onChange={(_, next) => setLinkOrg(next)}
              renderInput={(params) => <TextField {...params} label="Empresa" />}
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
          <Button variant="contained" onClick={handleLink} disabled={!linkOrg}>
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
