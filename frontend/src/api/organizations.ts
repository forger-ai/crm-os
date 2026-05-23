import { del, get, patch, post } from "./client";
import { qs } from "./qs";
import type {
  ContactOrganizationLink,
  OrganizationRead,
  OrganizationSummary,
} from "./types";

export interface OrganizationWritePayload {
  name: string;
  domain?: string | null;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  owner?: string | null;
  description?: string | null;
}

export type OrganizationPatchPayload = Partial<OrganizationWritePayload>;

export interface ListOrganizationsParams {
  q?: string;
  owner?: string;
  page?: number;
  page_size?: number;
}

export const listOrganizations = (params: ListOrganizationsParams = {}) =>
  get<OrganizationSummary[]>(`/api/organizations${qs({ ...params })}`);

export const getOrganization = (id: string) =>
  get<OrganizationRead>(`/api/organizations/${id}`);

export const createOrganization = (payload: OrganizationWritePayload) =>
  post<OrganizationRead>("/api/organizations", payload);

export const patchOrganization = (id: string, payload: OrganizationPatchPayload) =>
  patch<OrganizationRead>(`/api/organizations/${id}`, payload);

export const deleteOrganization = (id: string) =>
  del<void>(`/api/organizations/${id}`);

export const linkContactToOrganization = (
  organization_id: string,
  payload: { contact_id: string; role?: string | null; is_primary?: boolean },
) =>
  post<ContactOrganizationLink>(
    `/api/organizations/${organization_id}/contacts`,
    payload,
  );

export const unlinkContactFromOrganization = (
  organization_id: string,
  contact_id: string,
) =>
  del<void>(
    `/api/organizations/${organization_id}/contacts/${contact_id}`,
  );
