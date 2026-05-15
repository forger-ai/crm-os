import { del, get, patch, post, put } from "./client";
import type {
  CustomFieldDefRead,
  CustomFieldEntity,
  CustomFieldType,
  CustomFieldValueRead,
} from "./types";

export interface CustomFieldDefWritePayload {
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[] | null;
}

export type CustomFieldDefPatchPayload = Partial<{
  label: string;
  options: string[] | null;
  archived: boolean;
  position: number;
}>;

export interface CustomFieldValueWritePayload {
  field_id: string;
  value: unknown;
}

export const listCustomFields = (params: {
  entity?: CustomFieldEntity;
  include_archived?: boolean;
} = {}) => {
  const qs: string[] = [];
  if (params.entity) qs.push(`entity=${params.entity}`);
  if (params.include_archived) qs.push("include_archived=true");
  const suffix = qs.length ? `?${qs.join("&")}` : "";
  return get<CustomFieldDefRead[]>(`/api/custom-fields${suffix}`);
};

export const createCustomField = (payload: CustomFieldDefWritePayload) =>
  post<CustomFieldDefRead>("/api/custom-fields", payload);

export const patchCustomField = (
  id: string,
  payload: CustomFieldDefPatchPayload,
) => patch<CustomFieldDefRead>(`/api/custom-fields/${id}`, payload);

export const deleteCustomField = (id: string) =>
  del<void>(`/api/custom-fields/${id}`);

export const upsertCustomFieldValues = (
  entity: CustomFieldEntity,
  entity_id: string,
  values: CustomFieldValueWritePayload[],
) =>
  put<CustomFieldValueRead[]>(
    `/api/custom-fields/values/${entity}/${entity_id}`,
    values,
  );
