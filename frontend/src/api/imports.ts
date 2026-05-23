import { API_BASE_URL, ApiError, get } from "./client";
import type { ImportRunDetail, ImportRunRead } from "./types";

async function uploadCsv<T>(path: string, file: File, dryRun: boolean): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const url = `${API_BASE_URL}${path}?dry_run=${dryRun ? "true" : "false"}`;
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body: formData });
  } catch (error) {
    throw new ApiError(0, "Network error", error);
  }
  const payload = response.headers
    .get("Content-Type")
    ?.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && payload && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, detail, payload);
  }
  return payload as T;
}

export const importContactsCsv = (file: File, dryRun = false) =>
  uploadCsv<ImportRunDetail>("/api/imports/contacts", file, dryRun);

export const importOrganizationsCsv = (file: File, dryRun = false) =>
  uploadCsv<ImportRunDetail>("/api/imports/organizations", file, dryRun);

export const listImports = () => get<ImportRunRead[]>("/api/imports");

export const getImport = (id: string) =>
  get<ImportRunDetail>(`/api/imports/${id}`);
