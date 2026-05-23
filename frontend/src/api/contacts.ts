import { del, get, patch, post } from "./client";
import { qs } from "./qs";
import type { ContactRead, ContactSummary } from "./types";

export interface ContactWritePayload {
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  owner?: string | null;
  description?: string | null;
}

export type ContactPatchPayload = Partial<ContactWritePayload>;

export interface ListContactsParams {
  q?: string;
  organization_id?: string;
  owner?: string;
  page?: number;
  page_size?: number;
}

export const listContacts = (params: ListContactsParams = {}) =>
  get<ContactSummary[]>(`/api/contacts${qs({ ...params })}`);

export const getContact = (id: string) =>
  get<ContactRead>(`/api/contacts/${id}`);

export const createContact = (payload: ContactWritePayload) =>
  post<ContactRead>("/api/contacts", payload);

export const patchContact = (id: string, payload: ContactPatchPayload) =>
  patch<ContactRead>(`/api/contacts/${id}`, payload);

export const deleteContact = (id: string) => del<void>(`/api/contacts/${id}`);

export function contactDisplayName(
  contact: { first_name: string; last_name: string | null } | null | undefined,
): string {
  if (!contact) return "";
  return `${contact.first_name} ${contact.last_name ?? ""}`.trim();
}
