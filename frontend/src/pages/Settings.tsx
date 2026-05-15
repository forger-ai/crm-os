import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
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
import {
  createCustomField,
  deleteCustomField,
  listCustomFields,
} from "../api/customFields";
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
  PipelineRead,
} from "../api/types";
import CsvImporter from "../components/CsvImporter";
import { formatDateTime, formatRelative } from "../utils/format";

type SettingsTab =
  | "pipelines"
  | "custom_fields"
  | "import"
  | "history"
  | "connections";

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>("pipelines");
  const [pipelines, setPipelines] = useState<PipelineRead[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefRead[]>([]);
  const [imports, setImports] = useState<ImportRunRead[]>([]);
  const [emailSync, setEmailSync] = useState<EmailSyncStatus | null>(null);
  const [emailSyncLoading, setEmailSyncLoading] = useState(false);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === "connections") void loadEmailSync();
  }, [tab, loadEmailSync]);

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
    </Box>
  );
}
