import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { listPipelines } from "../api/pipelines";
import {
  getActivitiesOverview,
  getConversion,
  getPipelineValue,
  getWonLostByMonth,
} from "../api/reports";
import type {
  ActivitiesOverview,
  PipelineRead,
  PipelineValueByStage,
  StageConversionPoint,
  WonLostByMonth,
} from "../api/types";
import { formatMoney } from "../utils/format";

type ReportTab = "pipeline" | "won_lost" | "conversion" | "activities";

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>("pipeline");
  const [pipelines, setPipelines] = useState<PipelineRead[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [pipelineValue, setPipelineValue] = useState<PipelineValueByStage[]>([]);
  const [wonLost, setWonLost] = useState<WonLostByMonth[]>([]);
  const [conversion, setConversion] = useState<StageConversionPoint[]>([]);
  const [activities, setActivities] = useState<ActivitiesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPipelines().then((items) => {
      setPipelines(items);
      const fallback = items.find((p) => p.is_default) ?? items[0];
      setPipelineId(fallback?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!pipelineId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getPipelineValue({ pipeline_id: pipelineId }),
      getWonLostByMonth({}),
      getConversion({ pipeline_id: pipelineId }),
      getActivitiesOverview({}),
    ])
      .then(([pv, wl, cv, ov]) => {
        if (cancelled) return;
        setPipelineValue(pv);
        setWonLost(wl);
        setConversion(cv);
        setActivities(ov);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error cargando reportes"),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pipelineId]);

  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const stage of pipelineValue) {
      for (const [currency, cents] of Object.entries(stage.by_currency)) {
        totals[currency] = (totals[currency] ?? 0) + cents;
      }
    }
    return totals;
  }, [pipelineValue]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography variant="h5" fontWeight={700}>
          Reportes
        </Typography>
        <TextField
          select
          size="small"
          label="Pipeline"
          value={pipelineId}
          onChange={(event) => setPipelineId(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          {pipelines.map((pipeline) => (
            <MenuItem key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab value="pipeline" label="Pipeline" />
          <Tab value="won_lost" label="Ganados / Perdidos" />
          <Tab value="conversion" label="Conversión por stage" />
          <Tab value="activities" label="Actividades" />
        </Tabs>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {tab === "pipeline" && (
            <Stack spacing={2}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Valor total en pipeline (abierto)
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    {Object.keys(totalsByCurrency).length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Sin deals abiertos.
                      </Typography>
                    ) : (
                      Object.entries(totalsByCurrency).map(
                        ([currency, cents]) => (
                          <Box key={currency}>
                            <Typography variant="caption" color="text.secondary">
                              {currency}
                            </Typography>
                            <Typography variant="h6" fontWeight={700}>
                              {formatMoney(cents, currency)}
                            </Typography>
                          </Box>
                        ),
                      )
                    )}
                  </Stack>
                </CardContent>
              </Card>
              <Paper variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Stage</TableCell>
                      <TableCell align="right">Deals</TableCell>
                      <TableCell>Valor por moneda</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pipelineValue.map((stage) => (
                      <TableRow key={stage.stage_id}>
                        <TableCell>{stage.stage_name}</TableCell>
                        <TableCell align="right">{stage.deals_count}</TableCell>
                        <TableCell>
                          {Object.entries(stage.by_currency)
                            .map(([currency, cents]) =>
                              formatMoney(cents, currency),
                            )
                            .join(" · ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Stack>
          )}
          {tab === "won_lost" && (
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Mes</TableCell>
                    <TableCell align="right">Ganados</TableCell>
                    <TableCell align="right">Perdidos</TableCell>
                    <TableCell>Valor ganado</TableCell>
                    <TableCell>Valor perdido</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wonLost.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          Sin deals ganados ni perdidos.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    wonLost.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell>{row.month}</TableCell>
                        <TableCell align="right">{row.won_count}</TableCell>
                        <TableCell align="right">{row.lost_count}</TableCell>
                        <TableCell>
                          {Object.entries(row.won_by_currency)
                            .map(([c, v]) => formatMoney(v, c))
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          {Object.entries(row.lost_by_currency)
                            .map(([c, v]) => formatMoney(v, c))
                            .join(" · ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Paper>
          )}
          {tab === "conversion" && (
            <Stack spacing={1.5}>
              {conversion.map((point) => (
                <Card key={point.stage_id} variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="subtitle2" fontWeight={700}>
                        {point.stage_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Entraron {point.entered} · avanzaron {point.moved_forward}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.round(point.conversion_rate * 100)}
                      sx={{ height: 8, borderRadius: 4, mt: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Conversión: {(point.conversion_rate * 100).toFixed(1)}%
                    </Typography>
                  </CardContent>
                </Card>
              ))}
              {conversion.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Aún no hay movimientos entre stages registrados.
                </Typography>
              )}
            </Stack>
          )}
          {tab === "activities" && activities && (
            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 2 }}>
              <MetricCard
                label="Vencidas"
                value={activities.overdue}
                color="warning.main"
              />
              <MetricCard label="Vencen hoy" value={activities.due_today} />
              <MetricCard
                label="Vencen esta semana"
                value={activities.due_this_week}
              />
              <MetricCard
                label="Completadas (30 días)"
                value={activities.completed_last_30_days}
                color="success.main"
              />
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}

function MetricCard({
  label,
  value,
  color = "text.primary",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <Card variant="outlined" sx={{ flex: "1 1 200px", minWidth: 200 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" fontWeight={700} sx={{ color, mt: 0.5 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
