import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import UploadIcon from "@mui/icons-material/UploadFile";
import {
  importContactsCsv,
  importOrganizationsCsv,
} from "../api/imports";
import type { ImportRunDetail } from "../api/types";

type Source = "contacts" | "organizations";

interface Props {
  source: Source;
  onImported?: () => void;
}

const HEADERS_BY_SOURCE: Record<Source, string[]> = {
  contacts: [
    "first_name",
    "last_name",
    "email",
    "phone",
    "job_title",
    "owner",
    "description",
  ],
  organizations: [
    "name",
    "domain",
    "industry",
    "website",
    "phone",
    "address",
    "owner",
    "description",
  ],
};

export default function CsvImporter({ source, onImported }: Props) {
  const [preview, setPreview] = useState<ImportRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File, dryRun: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const result =
        source === "contacts"
          ? await importContactsCsv(file, dryRun)
          : await importOrganizationsCsv(file, dryRun);
      setPreview(result);
      if (!dryRun) onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la importación");
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    void upload(file, true);
  };

  const apply = async () => {
    if (!pendingFile) return;
    await upload(pendingFile, false);
    setPendingFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const reset = () => {
    setPreview(null);
    setError(null);
    setPendingFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          Columnas reconocidas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {HEADERS_BY_SOURCE[source].join(", ")}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          La primera fila debe ser el encabezado. Los espacios en los nombres se
          convierten a guiones bajos automáticamente.
        </Typography>
      </Paper>

      <Box>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={handleSelect}
        />
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          Cargar CSV (vista previa)
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {preview && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {preview.dry_run ? "Vista previa" : "Importación aplicada"}
          </Typography>
          <Stack
            direction="row"
            spacing={3}
            sx={{ mt: 1, flexWrap: "wrap", rowGap: 1 }}
          >
            <Typography variant="body2">Total: {preview.rows_total}</Typography>
            <Typography variant="body2" color="success.main">
              Importadas: {preview.rows_imported}
            </Typography>
            <Typography variant="body2" color="warning.main">
              Omitidas: {preview.rows_skipped}
            </Typography>
            <Typography variant="body2" color="error.main">
              Falladas: {preview.rows_failed}
            </Typography>
          </Stack>
          {preview.errors.length > 0 && (
            <Box sx={{ mt: 1.5, maxHeight: 200, overflowY: "auto" }}>
              {preview.errors.map((err, idx) => (
                <Typography
                  key={idx}
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  Fila {String(err.row ?? "?")}: {String(err.reason ?? "")}{" "}
                  {err.name ? `(${String(err.name)})` : ""}
                  {err.email ? `(${String(err.email)})` : ""}
                </Typography>
              ))}
            </Box>
          )}
          {preview.dry_run && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                disabled={busy || preview.rows_imported === 0}
                onClick={apply}
              >
                Aplicar importación ({preview.rows_imported})
              </Button>
              <Button onClick={reset}>Cancelar</Button>
            </Stack>
          )}
          {!preview.dry_run && (
            <Button sx={{ mt: 2 }} onClick={reset}>
              Cerrar
            </Button>
          )}
        </Paper>
      )}
    </Stack>
  );
}
