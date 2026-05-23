import { get } from "./client";
import { qs } from "./qs";
import type { LeadScoreRead, LeadScoreReport } from "./types";

export const getDealScore = (dealId: string) =>
  get<LeadScoreRead>(`/api/deals/${dealId}/score`);

export const getLeadScoringReport = (params: {
  pipeline_id?: string;
  limit?: number;
} = {}) =>
  get<LeadScoreReport>(`/api/reports/lead-scoring${qs({ ...params })}`);
