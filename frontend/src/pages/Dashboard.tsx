import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { getLeadScoringReport } from "../api/leadScoring";
import { getWeeklySummary } from "../api/reports";
import type { LeadScoreReport, WeeklySummary } from "../api/types";
import LeadScoreBadge from "../components/LeadScoreBadge";
import { formatMoney, formatDate, formatDateTime } from "../utils/format";

function MetricCard({
  label,
  value,
  color = "text.primary",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Card variant="outlined" sx={{ flex: "1 1 200px", minWidth: 200 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [scoring, setScoring] = useState<LeadScoreReport | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWeeklySummary(),
      getLeadScoringReport({ limit: 5 }).catch(() => null),
    ])
      .then(([data, report]) => {
        if (cancelled) return;
        setSummary(data);
        setScoring(report);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (!summary) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">No hay datos disponibles.</Typography>
      </Box>
    );
  }

  const pipelineTotals = Object.entries(summary.pipeline_value)
    .map(([currency, cents]) => formatMoney(cents, currency))
    .join(" · ");

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Dashboard
      </Typography>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 2, mb: 3 }}>
        <MetricCard
          label="Pipeline activo"
          value={pipelineTotals || "—"}
        />
        <MetricCard
          label="Deals abiertos"
          value={String(summary.deals_open)}
        />
        <MetricCard
          label="Ganados esta semana"
          value={String(summary.deals_won_this_week)}
          color="success.main"
        />
        <MetricCard
          label="Perdidos esta semana"
          value={String(summary.deals_lost_this_week)}
          color="error.main"
        />
        <MetricCard
          label="Actividades vencidas"
          value={String(summary.activities.overdue)}
          color="warning.main"
        />
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle1" fontWeight={700}>
                Próximas actividades
              </Typography>
              <Chip
                label={`${summary.activities.due_this_week} esta semana`}
                size="small"
              />
            </Stack>
            {summary.activities.upcoming.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No hay actividades pendientes en los próximos días.
              </Typography>
            ) : (
              <List dense disablePadding>
                {summary.activities.upcoming.map((activity) => (
                  <ListItemButton
                    key={activity.id}
                    onClick={() => navigate("/activities")}
                    sx={{ px: 0 }}
                  >
                    <ListItemText
                      primary={activity.subject}
                      secondary={`${activity.kind} · ${formatDateTime(activity.due_at)}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Deals atascados (&gt; 30 días sin movimiento)
            </Typography>
            {summary.stale_deals.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Todos los deals abiertos tuvieron actividad reciente.
              </Typography>
            ) : (
              <List dense disablePadding>
                {summary.stale_deals.map((deal) => (
                  <ListItemButton
                    key={deal.id}
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    sx={{ px: 0 }}
                  >
                    <ListItemText
                      primary={deal.title}
                      secondary={
                        <>
                          {deal.stage_name}
                          {" · "}
                          {formatMoney(deal.amount_cents, deal.currency)}
                          {deal.expected_close_date &&
                            ` · cierre ${formatDate(deal.expected_close_date)}`}
                        </>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }}>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Hot leads
            </Typography>
            {!scoring || scoring.hot.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin leads calientes por ahora.
              </Typography>
            ) : (
              <List dense disablePadding>
                {scoring.hot.map((entry) => (
                  <ListItemButton
                    key={entry.deal_id}
                    onClick={() => navigate(`/deals/${entry.deal_id}`)}
                    sx={{ px: 0 }}
                  >
                    <ListItemText
                      primary={
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                        >
                          <span style={{ fontWeight: 600 }}>{entry.deal_title}</span>
                          <LeadScoreBadge
                            score={entry.score}
                            band={entry.band}
                          />
                        </Stack>
                      }
                      secondary={`${entry.stage_name} · ${formatMoney(entry.amount_cents, entry.currency)}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
              Cold deals (revisar)
            </Typography>
            {!scoring || scoring.cold.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin deals fríos.
              </Typography>
            ) : (
              <List dense disablePadding>
                {scoring.cold.map((entry) => (
                  <ListItemButton
                    key={entry.deal_id}
                    onClick={() => navigate(`/deals/${entry.deal_id}`)}
                    sx={{ px: 0 }}
                  >
                    <ListItemText
                      primary={
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                        >
                          <span style={{ fontWeight: 600 }}>{entry.deal_title}</span>
                          <LeadScoreBadge
                            score={entry.score}
                            band={entry.band}
                          />
                        </Stack>
                      }
                      secondary={`${entry.stage_name} · ${formatMoney(entry.amount_cents, entry.currency)}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
