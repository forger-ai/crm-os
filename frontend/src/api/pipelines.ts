import { del, get, patch, post } from "./client";
import type { PipelineRead, PipelineStageRead } from "./types";

export interface PipelineWritePayload {
  name: string;
  is_default?: boolean;
}

export type PipelinePatchPayload = Partial<{
  name: string;
  is_default: boolean;
  archived: boolean;
}>;

export interface PipelineStageWritePayload {
  name: string;
  probability_default?: number;
  is_won?: boolean;
  is_lost?: boolean;
  color?: string;
}

export type PipelineStagePatchPayload = Partial<PipelineStageWritePayload>;

export const listPipelines = () => get<PipelineRead[]>("/api/pipelines");

export const createPipeline = (payload: PipelineWritePayload) =>
  post<PipelineRead>("/api/pipelines", payload);

export const patchPipeline = (id: string, payload: PipelinePatchPayload) =>
  patch<PipelineRead>(`/api/pipelines/${id}`, payload);

export const deletePipeline = (id: string) => del<void>(`/api/pipelines/${id}`);

export const createStage = (
  pipeline_id: string,
  payload: PipelineStageWritePayload,
) => post<PipelineStageRead>(`/api/pipelines/${pipeline_id}/stages`, payload);

export const patchStage = (
  pipeline_id: string,
  stage_id: string,
  payload: PipelineStagePatchPayload,
) =>
  patch<PipelineStageRead>(
    `/api/pipelines/${pipeline_id}/stages/${stage_id}`,
    payload,
  );

export const deleteStage = (pipeline_id: string, stage_id: string) =>
  del<void>(`/api/pipelines/${pipeline_id}/stages/${stage_id}`);

export const reorderStages = (pipeline_id: string, stage_ids: string[]) =>
  post<PipelineRead>(`/api/pipelines/${pipeline_id}/stages/reorder`, {
    stage_ids,
  });
