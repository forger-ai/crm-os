import {
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import type {
  CustomFieldDefRead,
  CustomFieldValueRead,
} from "../api/types";

interface Props {
  definitions: CustomFieldDefRead[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function CustomFieldEditor({
  definitions,
  values,
  onChange,
}: Props) {
  if (definitions.length === 0) return null;
  return (
    <Stack spacing={1.5}>
      {definitions.map((def) => {
        const value = values[def.id];
        if (def.type === "select") {
          return (
            <TextField
              key={def.id}
              select
              size="small"
              label={def.label}
              value={(value as string) ?? ""}
              onChange={(event) => onChange(def.id, event.target.value || null)}
            >
              <MenuItem value="">—</MenuItem>
              {(def.options ?? []).map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          );
        }
        if (def.type === "bool") {
          return (
            <FormControlLabel
              key={def.id}
              control={
                <Checkbox
                  checked={Boolean(value)}
                  onChange={(event) => onChange(def.id, event.target.checked)}
                />
              }
              label={def.label}
            />
          );
        }
        if (def.type === "number") {
          return (
            <TextField
              key={def.id}
              size="small"
              type="number"
              label={def.label}
              value={value === null || value === undefined ? "" : String(value)}
              onChange={(event) =>
                onChange(
                  def.id,
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
            />
          );
        }
        if (def.type === "date") {
          return (
            <TextField
              key={def.id}
              size="small"
              type="date"
              label={def.label}
              InputLabelProps={{ shrink: true }}
              value={typeof value === "string" ? value.slice(0, 10) : ""}
              onChange={(event) =>
                onChange(def.id, event.target.value || null)
              }
            />
          );
        }
        return (
          <TextField
            key={def.id}
            size="small"
            label={def.label}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(def.id, event.target.value || null)}
          />
        );
      })}
    </Stack>
  );
}

export function valuesFromCustomFieldReads(
  reads: CustomFieldValueRead[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const read of reads) {
    out[read.field_id] = read.value;
  }
  return out;
}
