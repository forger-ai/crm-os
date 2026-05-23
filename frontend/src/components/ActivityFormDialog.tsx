import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { createActivity } from "../api/activities";
import type { ActivityKind, ActivityRead } from "../api/types";
import {
  isoFromLocalDateInput,
  localDateInputFromIso,
} from "../utils/format";
import FreeTextAutocomplete from "./FreeTextAutocomplete";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDealId?: string | null;
  defaultContactId?: string | null;
  defaultOrganizationId?: string | null;
  onSaved: (activity: ActivityRead) => void;
}

export default function ActivityFormDialog({
  open,
  onClose,
  defaultDealId,
  defaultContactId,
  defaultOrganizationId,
  onSaved,
}: Props) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind("call");
    setSubject("");
    setBody("");
    setDueAt(localDateInputFromIso(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()));
    setOwner("");
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!subject.trim()) {
      setError("Asunto requerido");
      return;
    }
    if (!defaultDealId && !defaultContactId && !defaultOrganizationId) {
      setError("La actividad debe asociarse a deal, contacto o empresa");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await createActivity({
        kind,
        subject: subject.trim(),
        body: body.trim() || null,
        due_at: isoFromLocalDateInput(dueAt),
        owner: owner.trim() || null,
        deal_id: defaultDealId ?? null,
        contact_id: defaultContactId ?? null,
        organization_id: defaultOrganizationId ?? null,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando actividad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Nueva actividad</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            size="small"
            label="Tipo"
            value={kind}
            onChange={(event) => setKind(event.target.value as ActivityKind)}
          >
            <MenuItem value="call">Llamada</MenuItem>
            <MenuItem value="email">Email</MenuItem>
            <MenuItem value="meeting">Reunión</MenuItem>
            <MenuItem value="task">Tarea</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Asunto"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            autoFocus
          />
          <TextField
            size="small"
            type="datetime-local"
            label="Vencimiento"
            InputLabelProps={{ shrink: true }}
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
          <FreeTextAutocomplete
            scope="activity.owner"
            label="Owner"
            value={owner}
            onChange={setOwner}
          />
          <TextField
            size="small"
            label="Detalle"
            multiline
            minRows={2}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          {error && (
            <Stack sx={{ color: "error.main", fontSize: 14 }}>{error}</Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={submit} variant="contained" disabled={busy}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
