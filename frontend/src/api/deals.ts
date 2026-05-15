import { del, get, patch, post } from "./client";
import { qs } from "./qs";
import type { DealRead, DealStatus, DealSummary } from "./types";

export interface DealWritePayload {
  title: string;
  organization_id?: string | null;
  primary_contact_id?: string | null;
  pipeline_id: string;
  stage_id: string;
  owner?: string | null;
  amount_cents?: number;
  currency?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  description?: string | null;
}

export type DealPatchPayload = Partial<{
  title: string;
  organization_id: string | null;
  primary_contact_id: string | null;
  owner: string | null;
  amount_cents: number;
  currency: string;
  probability: number | null;
  expected_close_date: string | null;
  description: string | null;
}>;

export interface ListDealsParams {
  q?: string;
  pipeline_id?: string;
  stage_id?: string;
  status?: DealStatus;
  owner?: string;
  min_amount_cents?: number;
  max_amount_cents?: number;
  close_from?: string;
  close_to?: string;
  page?: number;
  page_size?: number;
}

export const listDeals = (params: ListDealsParams = {}) =>
  get<DealSummary[]>(`/api/deals${qs({ ...params })}`);

export const getDeal = (id: string) => get<DealRead>(`/api/deals/${id}`);

export const createDeal = (payload: DealWritePayload) =>
  post<DealRead>("/api/deals", payload);

export const patchDeal = (id: string, payload: DealPatchPayload) =>
  patch<DealRead>(`/api/deals/${id}`, payload);

export const deleteDeal = (id: string) => del<void>(`/api/deals/${id}`);

export const moveDeal = (
  id: string,
  payload: { stage_id: string; note?: string | null },
) => post<DealRead>(`/api/deals/${id}/move`, payload);

export const winDeal = (id: string, note?: string | null) =>
  post<DealRead>(`/api/deals/${id}/win`, { note });

export const loseDeal = (id: string, reason: string, note?: string | null) =>
  post<DealRead>(`/api/deals/${id}/lose`, { reason, note });

export const reopenDeal = (id: string) =>
  post<DealRead>(`/api/deals/${id}/reopen`, {});
