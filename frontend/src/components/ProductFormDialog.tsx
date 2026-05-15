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
} from "@mui/material";
import {
  createProduct,
  patchProduct,
  type ProductWritePayload,
} from "../api/products";
import type { ProductRead } from "../api/types";
import FreeTextAutocomplete from "./FreeTextAutocomplete";
import MoneyInput from "./MoneyInput";

interface Props {
  open: boolean;
  onClose: () => void;
  initialProduct?: ProductRead | null;
  onSaved: (product: ProductRead) => void;
}

export default function ProductFormDialog({
  open,
  onClose,
  initialProduct,
  onSaved,
}: Props) {
  const isEdit = !!initialProduct;
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [priceCents, setPriceCents] = useState(0);
  const [currency, setCurrency] = useState("CLP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSku(initialProduct?.sku ?? "");
    setName(initialProduct?.name ?? "");
    setDescription(initialProduct?.description ?? "");
    setCategory(initialProduct?.category ?? "");
    setPriceCents(initialProduct?.default_unit_price_cents ?? 0);
    setCurrency(initialProduct?.default_currency ?? "CLP");
  }, [open, initialProduct]);

  const submit = async () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: ProductWritePayload = {
        sku: sku.trim() || null,
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        default_unit_price_cents: priceCents,
        default_currency: currency.trim() || "CLP",
      };
      const saved =
        isEdit && initialProduct
          ? await patchProduct(initialProduct.id, payload)
          : await createProduct(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el producto.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? "Editar producto" : "Nuevo producto"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              label="SKU"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              fullWidth
              autoFocus
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <FreeTextAutocomplete
              scope="product.category"
              label="Categoría"
              value={category}
              onChange={setCategory}
            />
            <FreeTextAutocomplete
              scope="deal.currency"
              label="Moneda"
              value={currency}
              onChange={setCurrency}
            />
          </Stack>
          <MoneyInput
            cents={priceCents}
            onChange={setPriceCents}
            label="Precio unitario por defecto"
          />
          <TextField
            size="small"
            label="Descripción"
            multiline
            minRows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
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
