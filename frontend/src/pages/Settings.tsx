import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { API_BASE_URL } from "../api/client";
import { isForgerDesktop, runScanGmailForLeads } from "../api/codex";
import { listContacts } from "../api/contacts";
import {
  createCustomField,
  deleteCustomField,
  listCustomFields,
} from "../api/customFields";
import {
  acceptIncomingLead,
  dismissIncomingLead,
  getIntakeConfig,
  listIncomingLeads,
  updateIntakeConfig,
} from "../api/intake";
import {
  createPipeline,
  createStage,
  deleteStage,
  listPipelines,
  patchPipeline,
} from "../api/pipelines";
import { listImports } from "../api/imports";
import { getEmailSyncStatus } from "../api/sync";
import type {
  CustomFieldDefRead,
  CustomFieldEntity,
  CustomFieldType,
  EmailSyncStatus,
  ImportRunRead,
  IncomingLead,
  IntakeConfig,
  IntakeMode,
  PipelineRead,
} from "../api/types";
import CsvImporter from "../components/CsvImporter";
import { formatDateTime, formatRelative } from "../utils/format";

type SettingsTab =
  | "pipelines"
  | "custom_fields"
  | "import"
  | "history"
  | "connections"
  | "leads";

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>("pipelines");
  const [pipelines, setPipelines] = useState<PipelineRead[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefRead[]>([]);
  const [imports, setImports] = useState<ImportRunRead[]>([]);
  const [emailSync, setEmailSync] = useState<EmailSyncStatus | null>(null);
  const [emailSyncLoading, setEmailSyncLoading] = useState(false);

  // Lead intake (Gmail polling) state
  const [intakeConfig, setIntakeConfig] = useState<IntakeConfig | null>(null);
  const [intakeLeads, setIntakeLeads] = useState<IncomingLead[]>([]);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [acceptLead, setAcceptLead] = useState<IncomingLead | null>(null);
  const [acceptFirst, setAcceptFirst] = useState("");
  const [acceptLast, setAcceptLast] = useState("");
  const [acceptEmail, setAcceptEmail] = useState("");
  const [acceptPhone, setAcceptPhone] = useState("");
  const [acceptOrg, setAcceptOrg] = useState("");

  // Pipeline state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newStageOpen, setNewStageOpen] = useState<string | null>(null); // pipeline id
  const [newStageName, setNewStageName] = useState("");
  const [newStageWon, setNewStageWon] = useState(false);
  const [newStageLost, setNewStageLost] = useState(false);
  const [newStageProb, setNewStageProb] = useState("0");

  // Custom field state
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newFieldEntity, setNewFieldEntity] = useState<CustomFieldEntity>("deal");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");

  const refresh = useMemo(
    () => async () => {
      const [p, cf, imp] = await Promise.all([
        listPipelines(),
        listCustomFields(),
        listImports(),
      ]);
      setPipelines(p);
      setCustomFields(cf);
      setImports(imp);
    },
    [],
  );

  const loadEmailSync = useMemo(
    () => async () => {
      setEmailSyncLoading(true);
      try {
        setEmailSync(await getEmailSyncStatus());
      } finally {
        setEmailSyncLoading(false);
      }
    },
    [],
  );

  const loadIntake = useMemo(
    () => async () => {
      setIntakeLoading(true);
      try {
        const [config, leads] = await Promise.all([
          getIntakeConfig(),
          listIncomingLeads("pending"),
        ]);
        setIntakeConfig(config);
        setIntakeLeads(leads);
      } finally {
        setIntakeLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === "connections") void loadEmailSync();
  }, [tab, loadEmailSync]);

  useEffect(() => {
    if (tab === "leads") void loadIntake();
  }, [tab, loadIntake]);

  const submitPipeline = async () => {
    await createPipeline({ name: newPipelineName.trim() });
    setNewPipelineOpen(false);
    setNewPipelineName("");
    await refresh();
  };

  const submitStage = async () => {
    if (!newStageOpen) return;
    await createStage(newStageOpen, {
      name: newStageName.trim(),
      probability_default: Number(newStageProb || "0"),
      is_won: newStageWon,
      is_lost: newStageLost,
    });
    setNewStageOpen(null);
    setNewStageName("");
    setNewStageWon(false);
    setNewStageLost(false);
    setNewStageProb("0");
    await refresh();
  };

  const submitCustomField = async () => {
    const options =
      newFieldType === "select"
        ? newFieldOptions
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : null;
    await createCustomField({
      entity: newFieldEntity,
      key: newFieldKey.trim(),
      label: newFieldLabel.trim(),
      type: newFieldType,
      options,
    });
    setNewFieldOpen(false);
    setNewFieldKey("");
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewFieldOptions("");
    await refresh();
  };

  const saveIntakeConfig = async (patch: {
    enabled?: boolean;
    mode?: IntakeMode;
    poll_interval_minutes?: number;
  }) => {
    setIntakeConfig(await updateIntakeConfig(patch));
  };

  const scanNow = async () => {
    if (!intakeConfig || !isForgerDesktop()) return;
    setScanning(true);
    try {
      const contacts = await listContacts({ page_size: 200 });
      const knownEmails = contacts
        .map((contact) => contact.email)
        .filter((email): email is string => !!email && email.trim().length > 0);
      await runScanGmailForLeads({
        sinceIso: intakeConfig.since_iso,
        callbackBaseUrl: API_BASE_URL,
        knownEmails,
      });
      await loadIntake();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo escanear Gmail");
    } finally {
      setScanning(false);
    }
  };

  const openAccept = (lead: IncomingLead) => {
    setAcceptLead(lead);
    setAcceptFirst(lead.suggested_first_name ?? "");
    setAcceptLast(lead.suggested_last_name ?? "");
    setAcceptEmail(lead.from_email ?? "");
    setAcceptPhone(lead.suggested_phone ?? "");
    setAcceptOrg(lead.suggested_org_name ?? "");
  };

  const submitAccept = async () => {
    if (!acceptLead) return;
    try {
      await acceptIncomingLead(acceptLead.id, {
        first_name: acceptFirst.trim() || undefined,
        last_name: acceptLast.trim() || undefined,
        email: acceptEmail.trim() || undefined,
        phone: acceptPhone.trim() || undefined,
        organization_name: acceptOrg.trim() || undefined,
      });
      setAcceptLead(null);
      await loadIntake();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo aceptar el lead");
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissIncomingLead(id);
      await loadIntake();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo descartar");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Ajustes
      </Typography>
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab value="pipelines" label="Pipelines y stages" />
          <Tab value="custom_fields" label="Campos custom" />
          <Tab value="import" label="Importar CSV" />
          <Tab value="history" label="Historial de imports" />
          <Tab value="connections" label="Conexiones" />
          <Tab value="leads" label="Leads entrantes" />
        </Tabs>
      </Paper>

      {tab === "pipelines" && (
        <Stack spacing={2}>
          <Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setNewPipelineOpen(true)}
            >
              Nuevo pipeline
            </Button>
          </Box>
          {pipelines.map((pipeline) => (
            <Paper key={pipeline.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1" fontWeight={700}>
                    {pipeline.name}
                  </Typography>
                  {pipeline.is_default && (
                    <Chip size="small" label="Default" color="primary" />
                  )}
                </Stack>
                <Stack direction="row" spacing={1}>
                  {!pipeline.is_default && (
                    <Button
                      size="small"
                      onClick={async () => {
                        await patchPipeline(pipeline.id, { is_default: true });
                        await refresh();
                      }}
                    >
                      Marcar default
                    </Button>
                  )}
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setNewStageOpen(pipeline.id)}
                  >
                    Agregar stage
                  </Button>
                </Stack>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Stage</TableCell>
                    <TableCell align="right">Probabilidad</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pipeline.stages.map((stage) => (
                    <TableRow key={stage.id}>
                      <TableCell>{stage.position + 1}</TableCell>
                      <TableCell>{stage.name}</TableCell>
                      <TableCell align="right">
                        {stage.probability_default}%
                      </TableCell>
                      <TableCell>
                        {stage.is_won
                          ? "Won"
                          : stage.is_lost
                            ? "Lost"
                            : "Open"}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={async () => {
                            try {
                              await deleteStage(pipeline.id, stage.id);
                              await refresh();
                            } catch (err) {
                              alert(
                                err instanceof Error ? err.message : "No se pudo borrar",
                              );
                            }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === "custom_fields" && (
        <Stack spacing={2}>
          <Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setNewFieldOpen(true)}
            >
              Nuevo campo
            </Button>
          </Box>
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Entidad</TableCell>
                  <TableCell>Key</TableCell>
                  <TableCell>Etiqueta</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Opciones</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {customFields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell>{field.entity}</TableCell>
                    <TableCell>{field.key}</TableCell>
                    <TableCell>{field.label}</TableCell>
                    <TableCell>
                      {field.type}
                      {field.archived && " (archivado)"}
                    </TableCell>
                    <TableCell>{(field.options ?? []).join(", ")}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={async () => {
                          await deleteCustomField(field.id);
                          await refresh();
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {customFields.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        Sin campos custom todavía.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Stack>
      )}

      {tab === "import" && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Empresas
            </Typography>
            <CsvImporter source="organizations" onImported={() => void refresh()} />
          </Paper>
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Contactos
            </Typography>
            <CsvImporter source="contacts" onImported={() => void refresh()} />
          </Paper>
        </Stack>
      )}

      {tab === "history" && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Origen</TableCell>
                <TableCell>Archivo</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Importadas</TableCell>
                <TableCell align="right">Omitidas</TableCell>
                <TableCell align="right">Falladas</TableCell>
                <TableCell>Modo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {imports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary">
                      Sin importaciones aún.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                imports.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{formatDateTime(run.created_at)}</TableCell>
                    <TableCell>{run.source}</TableCell>
                    <TableCell>{run.filename ?? "—"}</TableCell>
                    <TableCell align="right">{run.rows_total}</TableCell>
                    <TableCell align="right">{run.rows_imported}</TableCell>
                    <TableCell align="right">{run.rows_skipped}</TableCell>
                    <TableCell align="right">{run.rows_failed}</TableCell>
                    <TableCell>{run.dry_run ? "Vista previa" : "Aplicada"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      {tab === "connections" && (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Gmail
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              La conexión a Gmail se administra en Forger Desktop. Una vez
              conectada, pídele al agente "sincroniza mis emails" o "envía el
              borrador pendiente del deal X" y CRM OS registrará las
              actividades automáticamente.
            </Typography>
            {emailSyncLoading && (
              <Typography variant="body2">Cargando…</Typography>
            )}
            {emailSync && (
              <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Última sync
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {emailSync.last_synced_at
                      ? formatRelative(emailSync.last_synced_at)
                      : "Sin sincronizaciones aún"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Emails registrados
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {emailSync.total_synced}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Últimas 24h
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {emailSync.last_24h}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Borradores pendientes de envío
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {emailSync.pending_send_count}
                  </Typography>
                </Box>
              </Stack>
            )}
            <Button
              sx={{ mt: 2 }}
              size="small"
              onClick={() => void loadEmailSync()}
            >
              Refrescar
            </Button>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2, opacity: 0.7 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Calendar (próximamente)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              La sincronización de calendario sigue pendiente hasta que Forger
              Desktop habilite el tool oficial de Calendar. Cuando esté
              disponible verás aquí el mismo patrón que Gmail.
            </Typography>
          </Paper>
        </Stack>
      )}

      {tab === "leads" && (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Detección de leads desde Gmail
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Mientras CRM OS está abierto, revisa tu Gmail en el intervalo
              que elijas y detecta correos de posibles clientes nuevos. Cada
              revisión usa el agente de Forger, así que queda desactivada hasta
              que tú la actives.
            </Typography>

            {!isForgerDesktop() && (
              <Alert severity="info" sx={{ mb: 2 }}>
                La detección automática solo corre cuando abres CRM OS desde
                Forger Desktop.
              </Alert>
            )}

            {intakeConfig && (
              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={intakeConfig.enabled}
                      onChange={(event) =>
                        void saveIntakeConfig({
                          enabled: event.target.checked,
                        })
                      }
                    />
                  }
                  label="Activar detección de leads desde Gmail"
                />
                <TextField
                  select
                  size="small"
                  label="Al detectar un lead"
                  sx={{ maxWidth: 360 }}
                  value={intakeConfig.mode}
                  disabled={!intakeConfig.enabled}
                  onChange={(event) =>
                    void saveIntakeConfig({
                      mode: event.target.value as IntakeMode,
                    })
                  }
                >
                  <MenuItem value="review">
                    Dejarlo en esta bandeja para revisar
                  </MenuItem>
                  <MenuItem value="auto">
                    Crear el contacto y el deal automáticamente
                  </MenuItem>
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Revisar Gmail cada"
                  sx={{ maxWidth: 360 }}
                  value={String(intakeConfig.poll_interval_minutes)}
                  disabled={!intakeConfig.enabled}
                  onChange={(event) =>
                    void saveIntakeConfig({
                      poll_interval_minutes: Number(event.target.value),
                    })
                  }
                >
                  <MenuItem value="1">1 minuto</MenuItem>
                  <MenuItem value="5">5 minutos</MenuItem>
                  <MenuItem value="10">10 minutos</MenuItem>
                  <MenuItem value="15">15 minutos</MenuItem>
                  <MenuItem value="30">30 minutos</MenuItem>
                  <MenuItem value="60">1 hora</MenuItem>
                </TextField>
                <Stack
                  direction="row"
                  spacing={4}
                  sx={{ flexWrap: "wrap", rowGap: 1 }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Última revisión
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {intakeConfig.last_polled_at
                        ? formatRelative(intakeConfig.last_polled_at)
                        : "Sin revisiones aún"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Leads por revisar
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {intakeConfig.pending_count}
                    </Typography>
                  </Box>
                </Stack>
                <Box>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!isForgerDesktop() || scanning}
                    onClick={() => void scanNow()}
                    startIcon={
                      scanning ? <CircularProgress size={14} /> : undefined
                    }
                  >
                    {scanning ? "Escaneando…" : "Escanear ahora"}
                  </Button>
                </Box>
              </Stack>
            )}
          </Paper>

          <Paper variant="outlined">
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ px: 2, pt: 2 }}
            >
              <Typography variant="subtitle1" fontWeight={700}>
                Leads por revisar
              </Typography>
              <Button size="small" onClick={() => void loadIntake()}>
                Refrescar
              </Button>
            </Stack>
            <Divider sx={{ mt: 1 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Remitente</TableCell>
                  <TableCell>Asunto</TableCell>
                  <TableCell>Por qué es un lead</TableCell>
                  <TableCell align="right">Confianza</TableCell>
                  <TableCell>Recibido</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {intakeLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        {intakeLoading
                          ? "Cargando…"
                          : "Sin leads por revisar. Los nuevos aparecerán aquí tras cada revisión de Gmail."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  intakeLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {lead.from_name ?? lead.from_email ?? "—"}
                        </Typography>
                        {lead.from_name && lead.from_email && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {lead.from_email}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{lead.subject ?? "—"}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {lead.reason ?? "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          label={`${Math.round(lead.confidence * 100)}%`}
                        />
                      </TableCell>
                      <TableCell>
                        {lead.received_at
                          ? formatRelative(lead.received_at)
                          : "—"}
                      </TableCell>
                      <TableCell align="right">
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent="flex-end"
                        >
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => openAccept(lead)}
                          >
                            Aceptar
                          </Button>
                          <Button
                            size="small"
                            color="inherit"
                            onClick={() => void handleDismiss(lead.id)}
                          >
                            Descartar
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
        </Stack>
      )}

      <Dialog
        open={newPipelineOpen}
        onClose={() => setNewPipelineOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Nuevo pipeline</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Nombre"
            sx={{ mt: 1 }}
            value={newPipelineName}
            onChange={(event) => setNewPipelineName(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewPipelineOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={submitPipeline}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!newStageOpen}
        onClose={() => setNewStageOpen(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Nuevo stage</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              size="small"
              label="Nombre"
              value={newStageName}
              onChange={(event) => setNewStageName(event.target.value)}
            />
            <TextField
              size="small"
              type="number"
              label="Probabilidad %"
              value={newStageProb}
              onChange={(event) => setNewStageProb(event.target.value)}
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant={newStageWon ? "contained" : "outlined"}
                size="small"
                color="success"
                onClick={() => {
                  setNewStageWon((prev) => !prev);
                  setNewStageLost(false);
                }}
              >
                Marca como ganado
              </Button>
              <Button
                variant={newStageLost ? "contained" : "outlined"}
                size="small"
                color="error"
                onClick={() => {
                  setNewStageLost((prev) => !prev);
                  setNewStageWon(false);
                }}
              >
                Marca como perdido
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewStageOpen(null)}>Cancelar</Button>
          <Button variant="contained" onClick={submitStage}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={newFieldOpen}
        onClose={() => setNewFieldOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Nuevo campo custom</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              size="small"
              label="Entidad"
              value={newFieldEntity}
              onChange={(event) =>
                setNewFieldEntity(event.target.value as CustomFieldEntity)
              }
            >
              <MenuItem value="deal">Deal</MenuItem>
              <MenuItem value="contact">Contacto</MenuItem>
              <MenuItem value="organization">Empresa</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="Key (snake_case)"
              value={newFieldKey}
              onChange={(event) => setNewFieldKey(event.target.value)}
            />
            <TextField
              size="small"
              label="Etiqueta"
              value={newFieldLabel}
              onChange={(event) => setNewFieldLabel(event.target.value)}
            />
            <TextField
              select
              size="small"
              label="Tipo"
              value={newFieldType}
              onChange={(event) =>
                setNewFieldType(event.target.value as CustomFieldType)
              }
            >
              <MenuItem value="text">Texto</MenuItem>
              <MenuItem value="number">Número</MenuItem>
              <MenuItem value="date">Fecha</MenuItem>
              <MenuItem value="bool">Booleano</MenuItem>
              <MenuItem value="select">Select</MenuItem>
            </TextField>
            {newFieldType === "select" && (
              <TextField
                size="small"
                label="Opciones (separadas por coma)"
                value={newFieldOptions}
                onChange={(event) => setNewFieldOptions(event.target.value)}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFieldOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={submitCustomField}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!acceptLead}
        onClose={() => setAcceptLead(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Aceptar lead</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Se creará un contacto y un deal en la primera etapa del pipeline
            por defecto. Revisa los datos antes de confirmar.
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              size="small"
              label="Nombre"
              value={acceptFirst}
              onChange={(event) => setAcceptFirst(event.target.value)}
            />
            <TextField
              size="small"
              label="Apellido"
              value={acceptLast}
              onChange={(event) => setAcceptLast(event.target.value)}
            />
            <TextField
              size="small"
              label="Email"
              value={acceptEmail}
              onChange={(event) => setAcceptEmail(event.target.value)}
            />
            <TextField
              size="small"
              label="Teléfono"
              value={acceptPhone}
              onChange={(event) => setAcceptPhone(event.target.value)}
            />
            <TextField
              size="small"
              label="Empresa"
              value={acceptOrg}
              onChange={(event) => setAcceptOrg(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAcceptLead(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void submitAccept()}>
            Crear contacto y deal
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
