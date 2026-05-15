import { useDroppable } from "@dnd-kit/core";
import { Box, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { DealSummary, PipelineStageRead } from "../api/types";
import { formatMoney } from "../utils/format";

interface Props {
  stage: PipelineStageRead;
  deals: DealSummary[];
  children: ReactNode;
}

function totalsByCurrency(deals: DealSummary[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const deal of deals) {
    totals[deal.currency] = (totals[deal.currency] ?? 0) + deal.amount_cents;
  }
  return totals;
}

export default function StageColumn({ stage, deals, children }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id: `stage-${stage.id}`,
    data: { stageId: stage.id },
  });

  const totals = totalsByCurrency(deals);

  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      sx={{
        width: 280,
        minWidth: 280,
        maxHeight: "calc(100vh - 200px)",
        display: "flex",
        flexDirection: "column",
        backgroundColor: isOver ? "primary.light" : "grey.50",
        transition: "background-color 0.15s ease",
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "white",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: stage.color,
            }}
          />
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            {stage.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {deals.length}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: "wrap" }}>
          {Object.entries(totals).map(([currency, cents]) => (
            <Typography key={currency} variant="caption" color="text.secondary">
              {formatMoney(cents, currency)}
            </Typography>
          ))}
        </Stack>
      </Box>
      <Box sx={{ p: 1, overflowY: "auto", flex: 1 }}>{children}</Box>
    </Paper>
  );
}
