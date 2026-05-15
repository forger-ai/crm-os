import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { listDeals } from "../api/deals";
import { listPipelines } from "../api/pipelines";
import type { DealStatus, DealSummary, PipelineRead } from "../api/types";
import DealFormDialog from "../components/DealFormDialog";
import EmptyState from "../components/EmptyState";
import { formatDate, formatMoney } from "../utils/format";

const STATUS_OPTIONS: Array<{ value: DealStatus | ""; label: string }> = [
  { value: "", label: "Todos los estados" },
  { value: "open", label: "Abiertos" },
  { value: "won", label: "Ganados" },
  { value: "lost", label: "Perdidos" },
];

export default function DealsList() {
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRead[]>([]);
  const [pipelineFilter, setPipelineFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<DealStatus | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    listPipelines().then(setPipelines).catch(() => setPipelines([]));
  }, []);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const rows = await listDeals({
          q: search.trim() || undefined,
          pipeline_id: pipelineFilter || undefined,
          status: (statusFilter || undefined) as DealStatus | undefined,
          page_size: 200,
        });
        setDeals(rows);
      } finally {
        setLoading(false);
      }
    },
    [search, pipelineFilter, statusFilter],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5" fontWeight={700}>
          Deals
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Nuevo deal
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 2 }}>
          <TextField
            label="Buscar"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            select
            size="small"
            label="Pipeline"
            value={pipelineFilter}
            onChange={(event) => setPipelineFilter(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {pipelines.map((pipeline) => (
              <MenuItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Estado"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as DealStatus | "")
            }
            sx={{ minWidth: 200 }}
          >
            {STATUS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : deals.length === 0 ? (
        <EmptyState
          title="Sin deals"
          description="Crea el primer deal para empezar a operar el pipeline."
          action={
            <Button variant="contained" onClick={() => setCreateOpen(true)}>
              Nuevo deal
            </Button>
          }
        />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Título</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell>Monto</TableCell>
                <TableCell>Cierre estimado</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deals.map((deal) => (
                <TableRow
                  key={deal.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/deals/${deal.id}`)}
                >
                  <TableCell>{deal.title}</TableCell>
                  <TableCell>{deal.organization_name ?? "—"}</TableCell>
                  <TableCell>{deal.stage_name}</TableCell>
                  <TableCell>
                    {formatMoney(deal.amount_cents, deal.currency)}
                  </TableCell>
                  <TableCell>{formatDate(deal.expected_close_date)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={deal.status}
                      color={
                        deal.status === "won"
                          ? "success"
                          : deal.status === "lost"
                            ? "error"
                            : "default"
                      }
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <DealFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pipelines={pipelines}
        onSaved={() => void refresh()}
      />
    </Box>
  );
}
