import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { listProducts } from "../api/products";
import { createQuote, patchQuote } from "../api/quotes";
import type { ProductRead, QuoteRead } from "../api/types";
import {
  formatMoney,
  isoFromLocalDateInput,
  localDateInputFromIso,
} from "../utils/format";
import FreeTextAutocomplete from "./FreeTextAutocomplete";
import LineItemEditor, {
  type DraftLine,
  createDraftLine,
} from "./LineItemEditor";

interface Props {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealCurrency: string;
  initialQuote?: QuoteRead | null;
  onSaved: (quote: QuoteRead) => void;
}

export default function QuoteFormDialog({
  open,
  onClose,
  dealId,
  dealCurrency,
  initialQuote,
  onSaved,
}: Props) {
  const isEdit = !!initialQuote;
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState(dealCurrency);
  const [taxRate, setTaxRate] = useState(19);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [products, setProducts] = useState<ProductRead[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle(initialQuote?.title ?? "");
    setCurrency(initialQuote?.currency ?? dealCurrency);
    setTaxRate(initialQuote?.tax_rate ?? 19);
    setValidUntil(localDateInputFromIso(initialQuote?.valid_until ?? null));
    setNotes(initialQuote?.notes ?? "");
    if (initialQuote) {
      setLines(
        initialQuote.lines.map((line) => ({
          _localId: line.id,
          product_id: line.product_id,
          name: line.name,
          description: line.description,
          quantity: line.quantity,
          unit_price_cents: line.unit_price_cents,
          discount_pct: line.discount_pct,
        })),
      );
    } else {
      setLines([createDraftLine()]);
    }
  }, [open, initialQuote, dealCurrency]);

  useEffect(() => {
    if (!open) return;
    listProducts({ page_size: 200 })
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [open]);

  const submit = async () => {
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    const validLines = lines
      .filter((line) => line.name.trim() && line.quantity > 0)
      .map(({ _localId: _omit, ...payload }) => payload);
    if (validLines.length === 0 && !isEdit) {
      setError("Agrega al menos una línea válida.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let saved: QuoteRead;
      if (isEdit && initialQuote) {
        saved = await patchQuote(initialQuote.id, {
          title: title.trim(),
          currency: currency.trim() || dealCurrency,
          tax_rate: taxRate,
          valid_until: isoFromLocalDateInput(validUntil),
          notes: notes.trim() || null,
        });
      } else {
        saved = await createQuote({
          deal_id: dealId,
          title: title.trim(),
          currency: currency.trim() || dealCurrency,
          tax_rate: taxRate,
          valid_until: isoFromLocalDateInput(validUntil),
          notes: notes.trim() || null,
          lines: validLines,
        });
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar la cotización.",
      );
    } finally {
      setBusy(false);
    }
  };

  // Live preview totals on the dialog so the user does not have to save first.
  const subtotal = lines.reduce((sum, line) => {
    const gross = line.quantity * line.unit_price_cents;
    return (
      sum +
      Math.round(line.discount_pct ? gross * (1 - line.discount_pct / 100) : gross)
    );
  }, 0);
  const tax = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + tax;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {isEdit
          ? `Editar cotización ${initialQuote?.number ?? ""}`
          : "Nueva cotización"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Título"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <FreeTextAutocomplete
              scope="deal.currency"
              label="Moneda"
              value={currency}
              onChange={setCurrency}
            />
            <TextField
              size="small"
              label="IVA / impuesto %"
              type="number"
              value={taxRate}
              onChange={(event) =>
                setTaxRate(
                  Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                )
              }
              sx={{ width: 160 }}
            />
            <TextField
              size="small"
              type="datetime-local"
              label="Vigente hasta"
              InputLabelProps={{ shrink: true }}
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>
            Líneas
          </Typography>
          {isEdit ? (
            <Alert severity="info">
              Las líneas de una cotización ya creada se editan con los botones
              de cada línea en la vista del deal. Aquí ajustas título, moneda,
              impuesto, vigencia y notas. Para cambiar líneas, primero cierra
              este diálogo.
            </Alert>
          ) : (
            <LineItemEditor
              currency={currency}
              lines={lines}
              products={products}
              onChange={setLines}
            />
          )}
          <TextField
            size="small"
            label="Notas"
            multiline
            minRows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <Stack
            direction="row"
            justifyContent="flex-end"
            spacing={3}
            sx={{ mt: 1 }}
          >
            <Typography variant="body2" color="text.secondary">
              Subtotal: <strong>{formatMoney(subtotal, currency)}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Impuesto: <strong>{formatMoney(tax, currency)}</strong>
            </Typography>
            <Typography variant="body1" fontWeight={700}>
              Total: {formatMoney(total, currency)}
            </Typography>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
