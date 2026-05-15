import { TextField } from "@mui/material";
import { centsToDecimal, decimalStringToCents } from "../utils/format";

interface Props {
  cents: number;
  onChange: (cents: number) => void;
  label?: string;
  size?: "small" | "medium";
  fullWidth?: boolean;
  disabled?: boolean;
}

export default function MoneyInput({
  cents,
  onChange,
  label = "Monto",
  size = "small",
  fullWidth = true,
  disabled = false,
}: Props) {
  return (
    <TextField
      label={label}
      size={size}
      fullWidth={fullWidth}
      disabled={disabled}
      value={centsToDecimal(cents)}
      onChange={(event) => onChange(decimalStringToCents(event.target.value))}
      inputProps={{ inputMode: "decimal", pattern: "[0-9]*" }}
    />
  );
}
