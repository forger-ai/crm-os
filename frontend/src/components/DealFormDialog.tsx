import { useEffect, useState } from "react";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { listContacts } from "../api/contacts";
import { createDeal, patchDeal } from "../api/deals";
import { listOrganizations } from "../api/organizations";
import type {
  ContactSummary,
  DealRead,
  OrganizationSummary,
  PipelineRead,
} from "../api/types";
import { contactDisplayName } from "../api/contacts";
import {
  isoFromLocalDateInput,
  localDateInputFromIso,
} from "../utils/format";
import FreeTextAutocomplete from "./FreeTextAutocomplete";
import MoneyInput from "./MoneyInput";

interface Props {
  open: boolean;
  onClose: () => void;
  pipelines: PipelineRead[];
  initialDeal?: DealRead | null;
  initialPipelineId?: string;
  initialStageId?: string;
  initialOrganizationId?: string | null;
  initialContactId?: string | null;
  onSaved: (deal: DealRead) => void;
}

interface FormState {
  title: string;
  pipeline_id: string;
  stage_id: string;
  organization_id: string | null;
  primary_contact_id: string | null;
  owner: string;
  amount_cents: number;
  currency: string;
  probability: string; // kept as string to allow blank
  expected_close_date: string;
  description: string;
}

function emptyForm(initial: Partial<FormState>): FormState {
  return {
    title: initial.title ?? "",
    pipeline_id: initial.pipeline_id ?? "",
    stage_id: initial.stage_id ?? "",
    organization_id: initial.organization_id ?? null,
    primary_contact_id: initial.primary_contact_id ?? null,
    owner: initial.owner ?? "",
    amount_cents: initial.amount_cents ?? 0,
    currency: initial.currency ?? "CLP",
    probability: initial.probability ?? "",
    expected_close_date: initial.expected_close_date ?? "",
    description: initial.description ?? "",
  };
}

export default function DealFormDialog({
  open,
  onClose,
  pipelines,
  initialDeal,
  initialPipelineId,
  initialStageId,
  initialOrganizationId,
  initialContactId,
  onSaved,
}: Props) {
  const isEdit = !!initialDeal;
  const defaultPipeline =
    pipelines.find((p) => p.is_default) ?? pipelines[0] ?? null;

  const [form, setForm] = useState<FormState>(() =>
    emptyForm(
      initialDeal
        ? {
            title: initialDeal.title,
            pipeline_id: initialDeal.pipeline_id,
            stage_id: initialDeal.stage_id,
            organization_id: initialDeal.organization_id,
            primary_contact_id: initialDeal.primary_contact_id,
            owner: initialDeal.owner ?? "",
            amount_cents: initialDeal.amount_cents,
            currency: initialDeal.currency,
            probability: String(initialDeal.probability),
            expected_close_date: localDateInputFromIso(
              initialDeal.expected_close_date,
            ),
            description: initialDeal.description ?? "",
          }
        : {
            pipeline_id: initialPipelineId ?? defaultPipeline?.id ?? "",
            stage_id:
              initialStageId ?? defaultPipeline?.stages[0]?.id ?? "",
            organization_id: initialOrganizationId ?? null,
            primary_contact_id: initialContactId ?? null,
          },
    ),
  );

  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listOrganizations({ page_size: 100 }).then(setOrganizations).catch(() => {});
    listContacts({ page_size: 100 }).then(setContacts).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      emptyForm(
        initialDeal
          ? {
              title: initialDeal.title,
              pipeline_id: initialDeal.pipeline_id,
              stage_id: initialDeal.stage_id,
              organization_id: initialDeal.organization_id,
              primary_contact_id: initialDeal.primary_contact_id,
              owner: initialDeal.owner ?? "",
              amount_cents: initialDeal.amount_cents,
              currency: initialDeal.currency,
              probability: String(initialDeal.probability),
              expected_close_date: localDateInputFromIso(
                initialDeal.expected_close_date,
              ),
              description: initialDeal.description ?? "",
            }
          : {
              pipeline_id: initialPipelineId ?? defaultPipeline?.id ?? "",
              stage_id: initialStageId ?? defaultPipeline?.stages[0]?.id ?? "",
              organization_id: initialOrganizationId ?? null,
              primary_contact_id: initialContactId ?? null,
            },
      ),
    );
  }, [
    open,
    initialDeal,
    initialPipelineId,
    initialStageId,
    initialOrganizationId,
    initialContactId,
    defaultPipeline?.id,
    defaultPipeline?.stages,
  ]);

  const selectedPipeline =
    pipelines.find((p) => p.id === form.pipeline_id) ?? null;
  const stages = selectedPipeline?.stages ?? [];

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.title.trim() || !form.pipeline_id || !form.stage_id) {
      setError("Título, pipeline y stage son obligatorios");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        pipeline_id: form.pipeline_id,
        stage_id: form.stage_id,
        organization_id: form.organization_id || null,
        primary_contact_id: form.primary_contact_id || null,
        owner: form.owner.trim() || null,
        amount_cents: form.amount_cents,
        currency: form.currency.trim() || "CLP",
        probability:
          form.probability === "" ? null : Math.max(0, Math.min(100, Number(form.probability))),
        expected_close_date: isoFromLocalDateInput(form.expected_close_date),
        description: form.description.trim() || null,
      };
      const saved = isEdit && initialDeal
        ? await patchDeal(initialDeal.id, payload)
        : await createDeal(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando el deal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? "Editar deal" : "Nuevo deal"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Título"
            size="small"
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            autoFocus
          />
          {!isEdit && (
            <Stack direction="row" spacing={2}>
              <TextField
                select
                size="small"
                label="Pipeline"
                value={form.pipeline_id}
                onChange={(event) => {
                  const next = event.target.value;
                  const pipeline = pipelines.find((p) => p.id === next);
                  update("pipeline_id", next);
                  update("stage_id", pipeline?.stages[0]?.id ?? "");
                }}
                fullWidth
              >
                {pipelines.map((pipeline) => (
                  <MenuItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Stage"
                value={form.stage_id}
                onChange={(event) => update("stage_id", event.target.value)}
                fullWidth
              >
                {stages.map((stage) => (
                  <MenuItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}
          <Autocomplete
            size="small"
            options={organizations}
            getOptionLabel={(o) => o.name}
            value={
              organizations.find((o) => o.id === form.organization_id) ?? null
            }
            onChange={(_, next) =>
              update("organization_id", next ? next.id : null)
            }
            renderInput={(params) => (
              <TextField {...params} label="Empresa" />
            )}
          />
          <Autocomplete
            size="small"
            options={contacts}
            getOptionLabel={(c) => contactDisplayName(c)}
            value={
              contacts.find((c) => c.id === form.primary_contact_id) ?? null
            }
            onChange={(_, next) =>
              update("primary_contact_id", next ? next.id : null)
            }
            renderInput={(params) => (
              <TextField {...params} label="Contacto principal" />
            )}
          />
          <Stack direction="row" spacing={2}>
            <MoneyInput
              cents={form.amount_cents}
              onChange={(value) => update("amount_cents", value)}
              label="Monto"
            />
            <FreeTextAutocomplete
              scope="deal.currency"
              label="Moneda"
              value={form.currency}
              onChange={(value) => update("currency", value)}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              label="Probabilidad %"
              type="number"
              value={form.probability}
              onChange={(event) => update("probability", event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              type="datetime-local"
              label="Cierre estimado"
              InputLabelProps={{ shrink: true }}
              value={form.expected_close_date}
              onChange={(event) =>
                update("expected_close_date", event.target.value)
              }
              fullWidth
            />
          </Stack>
          <FreeTextAutocomplete
            scope="deal.owner"
            label="Owner"
            value={form.owner}
            onChange={(value) => update("owner", value)}
          />
          <TextField
            size="small"
            label="Descripción"
            multiline
            minRows={2}
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
          {error && (
            <Stack sx={{ color: "error.main", fontSize: 14 }}>
              {error}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy}
        >
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
