import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { createActivity } from "../api/activities";
import type { ActivityRead } from "../api/types";
import FreeTextAutocomplete from "./FreeTextAutocomplete";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDealId?: string | null;
  defaultContactId?: string | null;
  defaultOrganizationId?: string | null;
  defaultTo?: string;
  defaultOwner?: string;
  contextLabel: string; // e.g. "deal Acme Q2" or "contacto Pedro Acme"
  onSaved?: (activity: ActivityRead) => void;
}

export default function EmailComposeDialog({
  open,
  onClose,
  defaultDealId,
  defaultContactId,
  defaultOrganizationId,
  defaultTo,
  defaultOwner,
  contextLabel,
  onSaved,
}: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedId, setStagedId] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo ?? "");
    setSubject("");
    setBody("");
    setOwner(defaultOwner ?? "");
    setError(null);
    setStagedId(null);
    setCopyHint(null);
  }, [open, defaultTo, defaultOwner]);

  const stage = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setError("Completa destinatario, asunto y cuerpo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const activity = await createActivity({
        kind: "email",
        subject: subject.trim(),
        body: body.trim(),
        owner: owner.trim() || null,
        deal_id: defaultDealId ?? null,
        contact_id: defaultContactId ?? null,
        organization_id: defaultOrganizationId ?? null,
        to_email: to.trim(),
        pending_send: true,
      });
      setStagedId(activity.id);
      onSaved?.(activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar el borrador.");
    } finally {
      setBusy(false);
    }
  };

  const agentPrompt = stagedId
    ? `Envía el borrador pendiente con id ${stagedId} desde mi Gmail al destinatario ${to.trim()}, asunto "${subject.trim()}". Después de enviarlo, marca esa actividad como completada y registra el message-id de Gmail.`
    : "";

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopyHint("Prompt copiado. Pégalo en el chat de Forger para enviar.");
    } catch {
      setCopyHint("No pude copiar al portapapeles. Selecciona manualmente.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Componer email</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Asociado a: {contextLabel}. CRM OS guarda el borrador y el agente lo
            envía desde tu Gmail conectado.
          </Typography>
          <TextField
            label="Para"
            size="small"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            disabled={!!stagedId}
            autoFocus
          />
          <TextField
            label="Asunto"
            size="small"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={!!stagedId}
          />
          <TextField
            label="Mensaje"
            multiline
            minRows={6}
            size="small"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!!stagedId}
          />
          <FreeTextAutocomplete
            scope="activity.owner"
            label="Owner"
            value={owner}
            onChange={setOwner}
            disabled={!!stagedId}
          />
          {error && <Alert severity="error">{error}</Alert>}
          {stagedId && (
            <Alert severity="success">
              Borrador guardado como actividad pendiente.
            </Alert>
          )}
          {stagedId && (
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                Pídele al agente que lo envíe
              </Typography>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={3}
                  value={agentPrompt}
                  InputProps={{ readOnly: true }}
                />
                <Tooltip title="Copiar prompt">
                  <IconButton onClick={copyPrompt}>
                    <ContentCopyIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
              {copyHint && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  {copyHint}
                </Typography>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {stagedId ? "Cerrar" : "Cancelar"}
        </Button>
        {!stagedId && (
          <Button variant="contained" onClick={stage} disabled={busy}>
            Guardar borrador
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
