import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useParams } from "react-router-dom";
import { completeActivity, deleteActivity } from "../api/activities";
import {
  upsertCustomFieldValues,
  listCustomFields,
} from "../api/customFields";
import { getDeal, loseDeal, reopenDeal, winDeal } from "../api/deals";
import { getDealScore } from "../api/leadScoring";
import { createNote, deleteNote, patchNote } from "../api/notes";
import { listPipelines } from "../api/pipelines";
import {
  acceptQuote,
  deleteQuote,
  listQuotes,
  rejectQuote,
  sendQuote,
} from "../api/quotes";
import type {
  CustomFieldDefRead,
  DealRead,
  LeadScoreRead,
  NoteRead,
  PipelineRead,
  QuoteSummary,
} from "../api/types";
import ActivityFormDialog from "../components/ActivityFormDialog";
import ActivityRow from "../components/ActivityRow";
import CustomFieldEditor, {
  valuesFromCustomFieldReads,
} from "../components/CustomFieldEditor";
import DealFormDialog from "../components/DealFormDialog";
import EmailComposeDialog from "../components/EmailComposeDialog";
import LeadScoreBadge from "../components/LeadScoreBadge";
import NoteList from "../components/NoteList";
import QuoteFormDialog from "../components/QuoteFormDialog";
import { formatDate, formatDateTime, formatMoney } from "../utils/format";

type TabKey =
  | "summary"
  | "activities"
  | "notes"
  | "history"
  | "custom"
  | "quotes"
  | "score";

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<DealRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("summary");
  const [pipelines, setPipelines] = useState<PipelineRead[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [loseOpen, setLoseOpen] = useState(false);
  const [loseReason, setLoseReason] = useState("");
  const [customDefs, setCustomDefs] = useState<CustomFieldDefRead[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [score, setScore] = useState<LeadScoreRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [fresh, freshQuotes, freshScore] = await Promise.all([
        getDeal(id),
        listQuotes({ deal_id: id, page_size: 100 }),
        getDealScore(id).catch(() => null),
      ]);
      setDeal(fresh);
      setCustomValues(valuesFromCustomFieldReads(fresh.custom_fields));
      setQuotes(freshQuotes);
      setScore(freshScore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el deal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listPipelines().then(setPipelines).catch(() => setPipelines([]));
    listCustomFields({ entity: "deal" })
      .then(setCustomDefs)
      .catch(() => setCustomDefs([]));
  }, []);

  const stageName = deal?.stage_name ?? "";

  const handleNoteCreate = async (body: string) => {
    if (!deal) return;
    await createNote({ body, deal_id: deal.id });
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
    if (!deal) return;
    const payload = Object.entries(customValues).map(([field_id, value]) => ({
      field_id,
      value,
    }));
    await upsertCustomFieldValues("deal", deal.id, payload);
    await refresh();
  };

  const onWin = async () => {
    if (!deal) return;
    await winDeal(deal.id, "");
    await refresh();
  };
  const onLose = async () => {
    if (!deal) return;
    await loseDeal(deal.id, loseReason || "Sin razón");
    setLoseOpen(false);
    setLoseReason("");
    await refresh();
  };
  const onReopen = async () => {
    if (!deal) return;
    await reopenDeal(deal.id);
    await refresh();
  };

  const sortedActivities = useMemo(
    () =>
      [...(deal?.activities ?? [])].sort((a, b) => {
        if (a.completed_at && !b.completed_at) return 1;
        if (!a.completed_at && b.completed_at) return -1;
        const ad = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd;
      }),
    [deal],
  );

  if (loading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (!deal) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error ?? "Deal no encontrado"}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate("/deals")} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          {deal.title}
        </Typography>
        {score && (
          <LeadScoreBadge
            score={score.score}
            band={score.band}
            tooltip={score.factors.map((factor) => `${factor.label}: ${factor.contribution}`).join(" · ")}
          />
        )}
        <Chip
          label={deal.status}
          size="small"
          color={
            deal.status === "won"
              ? "success"
              : deal.status === "lost"
                ? "error"
                : "default"
          }
        />
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
        >
          Componer email
        </Button>
        {deal.status === "open" && (
          <>
            <Button
              size="small"
              color="success"
              variant="contained"
              onClick={onWin}
            >
              Ganar
            </Button>
            <Button
              size="small"
              color="error"
              variant="outlined"
              onClick={() => setLoseOpen(true)}
            >
              Perder
            </Button>
          </>
        )}
        {deal.status !== "open" && (
          <Button size="small" variant="outlined" onClick={onReopen}>
            Reabrir
          </Button>
        )}
      </Stack>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack
            direction="row"
            spacing={4}
            sx={{ flexWrap: "wrap", rowGap: 2 }}
          >
            <Field
              label="Monto"
              value={formatMoney(deal.amount_cents, deal.currency)}
            />
            <Field label="Stage" value={stageName} />
            <Field label="Probabilidad" value={`${deal.probability}%`} />
            <Field
              label="Cierre estimado"
              value={formatDate(deal.expected_close_date)}
            />
            <Field label="Empresa" value={deal.organization_name ?? "—"} />
            <Field
              label="Contacto"
              value={deal.primary_contact_name ?? "—"}
            />
            <Field label="Owner" value={deal.owner ?? "—"} />
          </Stack>
          {deal.description && (
            <Typography variant="body2" sx={{ mt: 2, whiteSpace: "pre-wrap" }}>
              {deal.description}
            </Typography>
          )}
          {deal.lost_reason && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Razón de pérdida: {deal.lost_reason}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Paper variant="outlined">
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value="summary" label="Resumen" />
          <Tab value="quotes" label={`Cotizaciones (${quotes.length})`} />
          <Tab value="activities" label={`Actividades (${deal.activities.length})`} />
          <Tab value="notes" label={`Notas (${deal.notes.length})`} />
          <Tab value="history" label={`Historial (${deal.stage_history.length})`} />
          <Tab value="score" label="Score" />
          <Tab value="custom" label="Campos custom" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === "summary" && (
            <Typography variant="body2" color="text.secondary">
              Creado {formatDateTime(deal.created_at)} · última actualización{" "}
              {formatDateTime(deal.updated_at)}
            </Typography>
          )}
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
              {sortedActivities.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin actividades aún.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {sortedActivities.map((activity) => (
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
              notes={deal.notes}
              onCreate={handleNoteCreate}
              onTogglePin={handleTogglePin}
              onDelete={handleNoteDelete}
            />
          )}
          {tab === "history" && (
            <List dense disablePadding>
              {deal.stage_history.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{
                    py: 1,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2">
                    {entry.from_stage_name ?? "—"} → {entry.to_stage_name}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(entry.changed_at)}
                  </Typography>
                </Box>
              ))}
            </List>
          )}
          {tab === "quotes" && (
            <Stack spacing={1.5}>
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQuoteOpen(true)}
                >
                  Nueva cotización
                </Button>
              </Box>
              {quotes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Aún no hay cotizaciones para este deal.
                </Typography>
              ) : (
                quotes.map((quote) => (
                  <Paper key={quote.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Stack sx={{ flex: 1, minWidth: 220 }}>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {quote.number} · {quote.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Total: {formatMoney(quote.total_cents, quote.currency)}
                          {quote.valid_until
                            ? ` · vence ${formatDate(quote.valid_until)}`
                            : ""}
                        </Typography>
                      </Stack>
                      <Chip
                        size="small"
                        label={quote.status}
                        color={
                          quote.status === "accepted"
                            ? "success"
                            : quote.status === "rejected"
                              ? "error"
                              : quote.status === "expired"
                                ? "warning"
                                : "default"
                        }
                        variant="outlined"
                      />
                      {quote.status === "draft" && (
                        <Button
                          size="small"
                          onClick={async () => {
                            await sendQuote(quote.id);
                            await refresh();
                          }}
                        >
                          Marcar enviada
                        </Button>
                      )}
                      {quote.status === "sent" && (
                        <>
                          <Button
                            size="small"
                            color="success"
                            onClick={async () => {
                              await acceptQuote(quote.id);
                              await refresh();
                            }}
                          >
                            Aceptada
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            onClick={async () => {
                              await rejectQuote(quote.id);
                              await refresh();
                            }}
                          >
                            Rechazada
                          </Button>
                        </>
                      )}
                      {(quote.status === "draft" ||
                        quote.status === "expired") && (
                        <Button
                          size="small"
                          color="error"
                          onClick={async () => {
                            if (
                              window.confirm(
                                `¿Eliminar la cotización ${quote.number}?`,
                              )
                            ) {
                              await deleteQuote(quote.id);
                              await refresh();
                            }
                          }}
                        >
                          Eliminar
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>
          )}
          {tab === "score" && (
            <Stack spacing={1.5}>
              {score === null ? (
                <Typography variant="body2" color="text.secondary">
                  Cargando score…
                </Typography>
              ) : (
                <>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <LeadScoreBadge
                      score={score.score}
                      band={score.band}
                      size="medium"
                    />
                    <Typography variant="body2" color="text.secondary">
                      Recalculado al abrir esta vista.
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {score.factors.map((factor) => (
                      <Paper
                        key={factor.key}
                        variant="outlined"
                        sx={{ p: 1.5 }}
                      >
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Stack>
                            <Typography variant="subtitle2" fontWeight={700}>
                              {factor.label}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {factor.detail}
                            </Typography>
                          </Stack>
                          <Chip
                            size="small"
                            label={`+${factor.contribution}`}
                            variant="outlined"
                          />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </>
              )}
            </Stack>
          )}
          {tab === "custom" && (
            <Stack spacing={2}>
              {customDefs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No hay campos custom para deals. Configúralos en Ajustes.
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

      <DealFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        pipelines={pipelines}
        initialDeal={deal}
        onSaved={() => void refresh()}
      />
      <ActivityFormDialog
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        defaultDealId={deal.id}
        onSaved={() => void refresh()}
      />
      <EmailComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        defaultDealId={deal.id}
        defaultContactId={deal.primary_contact_id ?? undefined}
        defaultOrganizationId={deal.organization_id ?? undefined}
        defaultOwner={deal.owner ?? undefined}
        contextLabel={`deal ${deal.title}`}
        onSaved={() => void refresh()}
      />
      <QuoteFormDialog
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        dealId={deal.id}
        dealCurrency={deal.currency}
        onSaved={() => void refresh()}
      />
      <Dialog open={loseOpen} onClose={() => setLoseOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Marcar como perdido</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Razón"
            value={loseReason}
            onChange={(event) => setLoseReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoseOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={onLose}>
            Marcar perdido
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
