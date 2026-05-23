import { del, get, patch, post } from "./client";
import { qs } from "./qs";
import type { ActivityKind, ActivityRead } from "./types";

export interface ActivityWritePayload {
  kind: ActivityKind;
  subject: string;
  body?: string | null;
  due_at?: string | null;
  deal_id?: string | null;
  contact_id?: string | null;
  organization_id?: string | null;
  owner?: string | null;
  pending_send?: boolean;
  to_email?: string | null;
}

export type ActivityPatchPayload = Partial<ActivityWritePayload>;

export interface ListActivitiesParams {
  kind?: ActivityKind;
  completed?: boolean;
  due_from?: string;
  due_to?: string;
  deal_id?: string;
  contact_id?: string;
  organization_id?: string;
  owner?: string;
  pending_send?: boolean;
  external_provider?: string;
  page?: number;
  page_size?: number;
}

export const listActivities = (params: ListActivitiesParams = {}) =>
  get<ActivityRead[]>(`/api/activities${qs({ ...params })}`);

export const getActivity = (id: string) =>
  get<ActivityRead>(`/api/activities/${id}`);

export const createActivity = (payload: ActivityWritePayload) =>
  post<ActivityRead>("/api/activities", payload);

export const patchActivity = (id: string, payload: ActivityPatchPayload) =>
  patch<ActivityRead>(`/api/activities/${id}`, payload);

export const deleteActivity = (id: string) =>
  del<void>(`/api/activities/${id}`);

export const completeActivity = (id: string) =>
  post<ActivityRead>(`/api/activities/${id}/complete`, {});
