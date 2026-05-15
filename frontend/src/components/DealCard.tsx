import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent, Stack, Typography } from "@mui/material";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { DealSummary } from "../api/types";
import { formatMoney } from "../utils/format";

interface Props {
  deal: DealSummary;
}

export default function DealCard({ deal }: Props) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({ id: deal.id, data: { dealId: deal.id, stageId: deal.stage_id } });

  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.6 : 1,
    cursor: "grab",
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      variant="outlined"
      sx={{ mb: 1.25, "&:hover": { borderColor: "primary.main" } }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        navigate(`/deals/${deal.id}`);
      }}
      {...listeners}
      {...attributes}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {deal.title}
        </Typography>
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {deal.organization_name ?? "—"}
          </Typography>
          <Typography variant="caption" fontWeight={600}>
            {formatMoney(deal.amount_cents, deal.currency)}
          </Typography>
        </Stack>
        {deal.owner && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {deal.owner}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
