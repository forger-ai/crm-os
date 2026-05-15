import { get } from "./client";
import type { EmailSyncStatus } from "./types";

export const getEmailSyncStatus = () =>
  get<EmailSyncStatus>("/api/sync/email-status");
