import { get, post, put } from "./client";
import { qs } from "./qs";
import type {
  IncomingLead,
  IntakeConfig,
  IntakeConfigUpdate,
  LeadAcceptPayload,
} from "./types";

export const getIntakeConfig = () =>
  get<IntakeConfig>("/api/intake/config");

export const updateIntakeConfig = (payload: IntakeConfigUpdate) =>
  put<IntakeConfig>("/api/intake/config", payload);

export const listIncomingLeads = (status?: string) =>
  get<IncomingLead[]>(`/api/intake/leads${qs({ status })}`);

export const acceptIncomingLead = (id: string, payload: LeadAcceptPayload) =>
  post<IncomingLead>(`/api/intake/leads/${id}/accept`, payload);

export const dismissIncomingLead = (id: string) =>
  post<IncomingLead>(`/api/intake/leads/${id}/dismiss`, {});
