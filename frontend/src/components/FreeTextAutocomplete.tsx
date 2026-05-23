import { useEffect, useState } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { listFieldValues } from "../api/fieldValues";

interface Props {
  scope: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  size?: "small" | "medium";
  fullWidth?: boolean;
  disabled?: boolean;
}

export default function FreeTextAutocomplete({
  scope,
  value,
  onChange,
  label,
  placeholder,
  size = "small",
  fullWidth = true,
  disabled = false,
}: Props) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listFieldValues(scope, undefined, 50)
      .then((rows) => {
        if (!cancelled) setOptions(rows.map((r) => r.value));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={options}
      value={value}
      size={size}
      fullWidth={fullWidth}
      onInputChange={(_, next) => onChange(next ?? "")}
      onChange={(_, next) => onChange(typeof next === "string" ? next : "")}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} />
      )}
    />
  );
}
