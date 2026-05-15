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
  createOrganization,
  patchOrganization,
} from "../api/organizations";
import type { OrganizationRead } from "../api/types";
import FreeTextAutocomplete from "./FreeTextAutocomplete";

interface Props {
  open: boolean;
  onClose: () => void;
  initialOrganization?: OrganizationRead | null;
  onSaved: (org: OrganizationRead) => void;
}

export default function OrganizationFormDialog({
  open,
  onClose,
  initialOrganization,
  onSaved,
}: Props) {
  const isEdit = !!initialOrganization;
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(initialOrganization?.name ?? "");
    setDomain(initialOrganization?.domain ?? "");
    setIndustry(initialOrganization?.industry ?? "");
    setWebsite(initialOrganization?.website ?? "");
    setPhone(initialOrganization?.phone ?? "");
    setAddress(initialOrganization?.address ?? "");
    setOwner(initialOrganization?.owner ?? "");
    setDescription(initialOrganization?.description ?? "");
  }, [open, initialOrganization]);

  const submit = async () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        domain: domain.trim() || null,
        industry: industry.trim() || null,
        website: website.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        owner: owner.trim() || null,
        description: description.trim() || null,
      };
      const saved =
        isEdit && initialOrganization
          ? await patchOrganization(initialOrganization.id, payload)
          : await createOrganization(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando empresa");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Nombre"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Dominio"
              size="small"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              fullWidth
            />
            <TextField
              label="Sitio web"
              size="small"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <FreeTextAutocomplete
              scope="organization.industry"
              label="Industria"
              value={industry}
              onChange={setIndustry}
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
            scope="organization.address"
            label="Dirección"
            value={address}
            onChange={setAddress}
          />
          <FreeTextAutocomplete
            scope="organization.owner"
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
