import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import {
  ContactPatchPayload,
  ContactWritePayload,
  createContact,
  patchContact,
} from "../api/contacts";
import type { ContactRead } from "../api/types";
import FreeTextAutocomplete from "./FreeTextAutocomplete";

interface Props {
  open: boolean;
  onClose: () => void;
  initialContact?: ContactRead | null;
  onSaved: (contact: ContactRead) => void;
}

export default function ContactFormDialog({
  open,
  onClose,
  initialContact,
  onSaved,
}: Props) {
  const isEdit = !!initialContact;
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFirst(initialContact?.first_name ?? "");
    setLast(initialContact?.last_name ?? "");
    setEmail(initialContact?.email ?? "");
    setPhone(initialContact?.phone ?? "");
    setJobTitle(initialContact?.job_title ?? "");
    setOwner(initialContact?.owner ?? "");
    setDescription(initialContact?.description ?? "");
  }, [open, initialContact]);

  const submit = async () => {
    if (!first.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: ContactWritePayload | ContactPatchPayload = {
        first_name: first.trim(),
        last_name: last.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
        owner: owner.trim() || null,
        description: description.trim() || null,
      };
      const saved =
        isEdit && initialContact
          ? await patchContact(initialContact.id, payload)
          : await createContact(payload as ContactWritePayload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando contacto");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? "Editar contacto" : "Nuevo contacto"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Nombre"
              size="small"
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Apellido"
              size="small"
              value={last}
              onChange={(event) => setLast(event.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Email"
              size="small"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              fullWidth
            />
            <TextField
              label="Teléfono"
              size="small"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              fullWidth
            />
          </Stack>
          <FreeTextAutocomplete
            scope="contact.job_title"
            label="Cargo"
            value={jobTitle}
            onChange={setJobTitle}
          />
          <FreeTextAutocomplete
            scope="contact.owner"
            label="Owner"
            value={owner}
            onChange={setOwner}
          />
          <TextField
            label="Notas"
            multiline
            minRows={2}
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
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
