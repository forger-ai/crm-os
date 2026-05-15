import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { listDeals, moveDeal } from "../api/deals";
import { listPipelines } from "../api/pipelines";
import type { DealSummary, PipelineRead } from "../api/types";
import DealCard from "../components/DealCard";
import DealFormDialog from "../components/DealFormDialog";
import StageColumn from "../components/StageColumn";

export default function PipelineBoard() {
  const [pipelines, setPipelines] = useState<PipelineRead[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string>("");
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStage, setCreateStage] = useState<string | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    let cancelled = false;
    listPipelines().then((items) => {
      if (cancelled) return;
      setPipelines(items);
      const fallback = items.find((p) => p.is_default) ?? items[0];
      setActivePipelineId(fallback?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activePipelineId) return;
    let cancelled = false;
    setLoading(true);
    listDeals({ pipeline_id: activePipelineId, status: "open", page_size: 200 })
      .then((rows) => {
        if (!cancelled) setDeals(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePipelineId]);

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === activePipelineId) ?? null,
    [pipelines, activePipelineId],
  );

  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, DealSummary[]>();
    for (const stage of activePipeline?.stages ?? []) grouped.set(stage.id, []);
    for (const deal of deals) {
      if (!grouped.has(deal.stage_id)) grouped.set(deal.stage_id, []);
      grouped.get(deal.stage_id)!.push(deal);
    }
    return grouped;
  }, [activePipeline, deals]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const dealId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const targetStageId = overId.startsWith("stage-")
      ? overId.slice("stage-".length)
      : null;
    if (!targetStageId) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;

    // Optimistic update
    const previous = deals;
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage_id: targetStageId,
              stage_name:
                activePipeline?.stages.find((s) => s.id === targetStageId)?.name ??
                d.stage_name,
            }
          : d,
      ),
    );
    try {
      const updated = await moveDeal(dealId, { stage_id: targetStageId });
      setDeals((prev) =>
        prev.map((d) =>
          d.id === dealId
            ? {
                id: updated.id,
                title: updated.title,
                pipeline_id: updated.pipeline_id,
                stage_id: updated.stage_id,
                stage_name: updated.stage_name,
                organization_id: updated.organization_id,
                organization_name: updated.organization_name,
                primary_contact_id: updated.primary_contact_id,
                primary_contact_name: updated.primary_contact_name,
                owner: updated.owner,
                amount_cents: updated.amount_cents,
                currency: updated.currency,
                probability: updated.probability,
                expected_close_date: updated.expected_close_date,
                status: updated.status,
                updated_at: updated.updated_at,
              }
            : d,
        ),
      );
      if (updated.status !== "open") {
        // Won/lost deals leave the open kanban
        setDeals((prev) => prev.filter((d) => d.id !== dealId));
      }
    } catch {
      setDeals(previous);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h5" fontWeight={700}>
            Pipeline
          </Typography>
          <TextField
            select
            size="small"
            label="Pipeline"
            value={activePipelineId}
            onChange={(event) => setActivePipelineId(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            {pipelines.map((pipeline) => (
              <MenuItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
                {pipeline.is_default ? " (default)" : ""}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setCreateStage(activePipeline?.stages[0]?.id);
            setCreateOpen(true);
          }}
        >
          Nuevo deal
        </Button>
      </Stack>

      {loading || !activePipeline ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ overflowX: "auto", pb: 1, alignItems: "flex-start" }}
          >
            {activePipeline.stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage.get(stage.id) ?? []}
              >
                {(dealsByStage.get(stage.id) ?? []).map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </StageColumn>
            ))}
          </Stack>
        </DndContext>
      )}

      <DealFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pipelines={pipelines}
        initialPipelineId={activePipelineId}
        initialStageId={createStage}
        onSaved={(deal) => {
          if (deal.pipeline_id === activePipelineId && deal.status === "open") {
            setDeals((prev) => [
              {
                id: deal.id,
                title: deal.title,
                pipeline_id: deal.pipeline_id,
                stage_id: deal.stage_id,
                stage_name: deal.stage_name,
                organization_id: deal.organization_id,
                organization_name: deal.organization_name,
                primary_contact_id: deal.primary_contact_id,
                primary_contact_name: deal.primary_contact_name,
                owner: deal.owner,
                amount_cents: deal.amount_cents,
                currency: deal.currency,
                probability: deal.probability,
                expected_close_date: deal.expected_close_date,
                status: deal.status,
                updated_at: deal.updated_at,
              },
              ...prev,
            ]);
          }
        }}
      />
    </Box>
  );
}
