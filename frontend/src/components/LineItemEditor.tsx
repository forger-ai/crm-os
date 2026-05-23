import {
  Autocomplete,
  Box,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import type { ProductRead } from "../api/types";
import type { QuoteLineWritePayload } from "../api/quotes";
import { centsToDecimal, decimalStringToCents, formatMoney } from "../utils/format";

export interface DraftLine extends QuoteLineWritePayload {
  // local-only marker so the UI can keep keying React without backend ids
  _localId: string;
}

interface Props {
  currency: string;
  lines: DraftLine[];
  products: ProductRead[];
  onChange: (lines: DraftLine[]) => void;
}

function createBlankLine(): DraftLine {
  return {
    _localId: Math.random().toString(36).slice(2),
    product_id: null,
    name: "",
    description: null,
    quantity: 1,
    unit_price_cents: 0,
    discount_pct: 0,
  };
}

function lineTotalCents(line: DraftLine): number {
  const gross = line.quantity * line.unit_price_cents;
  if (!line.discount_pct) return Math.round(gross);
  return Math.round(gross * (1 - line.discount_pct / 100));
}

export default function LineItemEditor({
  currency,
  lines,
  products,
  onChange,
}: Props) {
  const update = (index: number, patch: Partial<DraftLine>) => {
    const next = lines.map((line, idx) =>
      idx === index ? { ...line, ...patch } : line,
    );
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(lines.filter((_, idx) => idx !== index));
  };

  const add = () => {
    onChange([...lines, createBlankLine()]);
  };

  const handleProductPick = (index: number, product: ProductRead | null) => {
    if (!product) {
      update(index, { product_id: null });
      return;
    }
    update(index, {
      product_id: product.id,
      name: product.name,
      unit_price_cents: product.default_unit_price_cents,
      description: product.description ?? null,
    });
  };

  const subtotal = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);

  return (
    <Stack spacing={1.5}>
      {lines.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Sin líneas aún. Agrega una con el botón de abajo.
        </Typography>
      ) : (
        lines.map((line, index) => (
          <Paper key={line._localId} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Autocomplete
                  size="small"
                  sx={{ flex: 1 }}
                  options={products}
                  getOptionLabel={(option) =>
                    option.sku ? `${option.sku} · ${option.name}` : option.name
                  }
                  value={
                    products.find((product) => product.id === line.product_id) ??
                    null
                  }
                  onChange={(_, next) => handleProductPick(index, next)}
                  renderInput={(params) => (
                    <TextField {...params} label="Producto" />
                  )}
                />
                <IconButton size="small" onClick={() => remove(index)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
              <TextField
                size="small"
                label="Nombre / detalle"
                value={line.name}
                onChange={(event) => update(index, { name: event.target.value })}
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Cantidad"
                  type="number"
                  value={line.quantity}
                  onChange={(event) =>
                    update(index, {
                      quantity: Math.max(0.0001, Number(event.target.value) || 0),
                    })
                  }
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Precio unitario"
                  value={centsToDecimal(line.unit_price_cents)}
                  onChange={(event) =>
                    update(index, {
                      unit_price_cents: decimalStringToCents(event.target.value),
                    })
                  }
                  inputProps={{ inputMode: "decimal" }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Descuento %"
                  type="number"
                  value={line.discount_pct ?? 0}
                  onChange={(event) =>
                    update(index, {
                      discount_pct: Math.max(
                        0,
                        Math.min(100, Number(event.target.value) || 0),
                      ),
                    })
                  }
                  sx={{ flex: 0.6 }}
                />
                <Box sx={{ flex: 0.8, alignSelf: "center", textAlign: "right" }}>
                  <Typography variant="body2" fontWeight={600}>
                    {formatMoney(lineTotalCents(line), currency)}
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          </Paper>
        ))
      )}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <IconButton size="small" onClick={add}>
          <AddIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">
          Subtotal estimado:{" "}
          <strong>{formatMoney(subtotal, currency)}</strong>
        </Typography>
      </Stack>
    </Stack>
  );
}

export function createDraftLine() {
  return createBlankLine();
}
