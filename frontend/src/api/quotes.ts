import { del, get, patch, post } from "./client";
import { qs } from "./qs";
import type { QuoteRead, QuoteStatus, QuoteSummary } from "./types";

export interface QuoteLineWritePayload {
  product_id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_pct?: number;
}

export type QuoteLinePatchPayload = Partial<QuoteLineWritePayload>;

export interface QuoteWritePayload {
  deal_id: string;
  title: string;
  currency?: string;
  tax_rate?: number;
  valid_until?: string | null;
  notes?: string | null;
  lines?: QuoteLineWritePayload[];
}

export type QuotePatchPayload = Partial<{
  title: string;
  currency: string;
  tax_rate: number;
  valid_until: string | null;
  notes: string | null;
}>;

export interface ListQuotesParams {
  deal_id?: string;
  status?: QuoteStatus;
  page?: number;
  page_size?: number;
}

export const listQuotes = (params: ListQuotesParams = {}) =>
  get<QuoteSummary[]>(`/api/quotes${qs({ ...params })}`);

export const getQuote = (id: string) => get<QuoteRead>(`/api/quotes/${id}`);

export const createQuote = (payload: QuoteWritePayload) =>
  post<QuoteRead>("/api/quotes", payload);

export const patchQuote = (id: string, payload: QuotePatchPayload) =>
  patch<QuoteRead>(`/api/quotes/${id}`, payload);

export const deleteQuote = (id: string) => del<void>(`/api/quotes/${id}`);

export const addQuoteLine = (
  quoteId: string,
  payload: QuoteLineWritePayload,
) => post<QuoteRead>(`/api/quotes/${quoteId}/lines`, payload);

export const patchQuoteLine = (
  quoteId: string,
  lineId: string,
  payload: QuoteLinePatchPayload,
) => patch<QuoteRead>(`/api/quotes/${quoteId}/lines/${lineId}`, payload);

export const deleteQuoteLine = (quoteId: string, lineId: string) =>
  del<QuoteRead>(`/api/quotes/${quoteId}/lines/${lineId}`);

export const sendQuote = (id: string) =>
  post<QuoteRead>(`/api/quotes/${id}/send`, {});

export const acceptQuote = (id: string) =>
  post<QuoteRead>(`/api/quotes/${id}/accept`, {});

export const rejectQuote = (id: string) =>
  post<QuoteRead>(`/api/quotes/${id}/reject`, {});
