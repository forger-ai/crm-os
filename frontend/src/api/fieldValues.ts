import { get } from "./client";
import type { FieldValueRead } from "./types";

export const listFieldValues = (
  scope: string,
  query?: string,
  limit = 25,
) => {
  const qs = new URLSearchParams({ scope, limit: String(limit) });
  if (query) qs.set("q", query);
  return get<FieldValueRead[]>(`/api/field-values?${qs.toString()}`);
};

export const listFieldValueScopes = () => get<string[]>("/api/field-values/scopes");
