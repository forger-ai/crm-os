import { Chip, Tooltip } from "@mui/material";
import type { LeadBand } from "../api/types";

interface Props {
  score: number;
  band: LeadBand;
  size?: "small" | "medium";
  tooltip?: string;
}

const COLORS: Record<LeadBand, "success" | "warning" | "default"> = {
  hot: "success",
  warm: "warning",
  cold: "default",
};

const LABELS: Record<LeadBand, string> = {
  hot: "Caliente",
  warm: "Tibio",
  cold: "Frío",
};

export default function LeadScoreBadge({
  score,
  band,
  size = "small",
  tooltip,
}: Props) {
  const chip = (
    <Chip
      size={size}
      label={`${score} · ${LABELS[band]}`}
      color={COLORS[band]}
      variant={band === "cold" ? "outlined" : "filled"}
    />
  );
  if (!tooltip) return chip;
  return <Tooltip title={tooltip}>{chip}</Tooltip>;
}
