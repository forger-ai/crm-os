import { del, get, patch, post } from "./client";
import { qs } from "./qs";
import type { NoteRead } from "./types";

export interface NoteWritePayload {
  body: string;
  deal_id?: string | null;
  contact_id?: string | null;
  organization_id?: string | null;
  author?: string | null;
  pinned?: boolean;
}

export type NotePatchPayload = Partial<{ body: string; pinned: boolean }>;

export interface ListNotesParams {
  deal_id?: string;
  contact_id?: string;
  organization_id?: string;
}

export const listNotes = (params: ListNotesParams = {}) =>
  get<NoteRead[]>(`/api/notes${qs({ ...params })}`);

export const createNote = (payload: NoteWritePayload) =>
  post<NoteRead>("/api/notes", payload);

export const patchNote = (id: string, payload: NotePatchPayload) =>
  patch<NoteRead>(`/api/notes/${id}`, payload);

export const deleteNote = (id: string) => del<void>(`/api/notes/${id}`);
