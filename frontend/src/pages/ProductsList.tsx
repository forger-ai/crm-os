import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { deleteProduct, listProducts } from "../api/products";
import type { ProductRead } from "../api/types";
import EmptyState from "../components/EmptyState";
import ProductFormDialog from "../components/ProductFormDialog";
import { formatMoney } from "../utils/format";

export default function ProductsList() {
  const [products, setProducts] = useState<ProductRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRead | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const rows = await listProducts({
          q: search.trim() || undefined,
          include_archived: includeArchived,
          page_size: 200,
        });
        setProducts(rows);
      } finally {
        setLoading(false);
      }
    },
    [search, includeArchived],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEdit = (product: ProductRead) => {
    setEditing(product);
    setDialogOpen(true);
  };

  const handleDelete = async (product: ProductRead) => {
    if (
      !window.confirm(
        product.archived
          ? `¿Eliminar "${product.name}" permanentemente?`
          : `¿Eliminar "${product.name}"? Si tiene cotizaciones, queda archivado.`,
      )
    ) {
      return;
    }
    await deleteProduct(product.id);
    await refresh();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5" fontWeight={700}>
          Productos
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Nuevo producto
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            label="Buscar SKU o nombre"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ flex: 1 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
            }
            label="Incluir archivados"
          />
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : products.length === 0 ? (
        <EmptyState
          title="Sin productos"
          description="Crea productos para usarlos en cotizaciones."
        />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell align="right">Precio default</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id} hover>
                  <TableCell>{product.sku ?? "—"}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.category ?? "—"}</TableCell>
                  <TableCell align="right">
                    {formatMoney(
                      product.default_unit_price_cents,
                      product.default_currency,
                    )}
                  </TableCell>
                  <TableCell>
                    {product.archived ? (
                      <Chip
                        size="small"
                        label="Archivado"
                        color="warning"
                        variant="outlined"
                      />
                    ) : (
                      <Chip size="small" label="Activo" color="success" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleEdit(product)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(product)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <ProductFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialProduct={editing}
        onSaved={() => void refresh()}
      />
    </Box>
  );
}
