import { get } from "./client";
import { qs } from "./qs";
import type {
  ActivitiesOverview,
  PipelineValueByStage,
  StageConversionPoint,
  WeeklySummary,
  WonLostByMonth,
} from "./types";

export const getPipelineValue = (params: {
  pipeline_id?: string;
  owner?: string;
} = {}) =>
  get<PipelineValueByStage[]>(`/api/reports/pipeline-value${qs({ ...params })}`);

export const getWonLostByMonth = (params: {
  from?: string;
  to?: string;
  owner?: string;
} = {}) => get<WonLostByMonth[]>(`/api/reports/won-lost-by-month${qs({ ...params })}`);

export const getConversion = (params: {
  pipeline_id: string;
  from?: string;
  to?: string;
}) => get<StageConversionPoint[]>(`/api/reports/conversion${qs({ ...params })}`);

export const getActivitiesOverview = (params: { owner?: string } = {}) =>
  get<ActivitiesOverview>(`/api/reports/activities-overview${qs({ ...params })}`);

export const getWeeklySummary = (params: { owner?: string } = {}) =>
  get<WeeklySummary>(`/api/reports/weekly-summary${qs({ ...params })}`);
