/**
 * Helpers to trigger agent promptTemplates through Forger Desktop.
 *
 * `window.forgerApp.startCodexTask` runs the agent with a manifest
 * promptTemplate; the promise resolves once the task completes, fails, or is
 * canceled. `window.forgerApp` exists only when the app runs inside Forger
 * Desktop, so callers must handle CodexUnavailableError (or check
 * `isForgerDesktop()` first).
 */

export class CodexUnavailableError extends Error {
  constructor() {
    super(
      "Forger Desktop no está disponible. Abre esta app desde Forger Desktop.",
    );
    this.name = "CodexUnavailableError";
  }
}

export function isForgerDesktop(): boolean {
  return typeof window !== "undefined" && !!window.forgerApp;
}

function toArg(value: string): { type: "string"; value: string } {
  return { type: "string", value };
}

async function awaitCompletion(
  runId: string,
): Promise<ForgerCodexTaskSummary> {
  const api = window.forgerApp;
  if (!api) throw new CodexUnavailableError();
  const initial = await api.getCodexTask(runId);
  if (
    initial &&
    ["completed", "failed", "canceled"].includes(initial.status)
  ) {
    return initial;
  }
  return new Promise((resolve) => {
    const unsubscribe = api.onCodexTaskUpdated((event) => {
      if (event.task.runId !== runId) return;
      if (["completed", "failed", "canceled"].includes(event.task.status)) {
        unsubscribe();
        resolve(event.task);
      }
    });
  });
}

/** Run the Gmail lead scan. The agent posts detected leads to the backend. */
export async function runScanGmailForLeads(args: {
  sinceIso: string;
  callbackBaseUrl: string;
  knownEmails: string[];
}): Promise<ForgerCodexTaskSummary> {
  if (!window.forgerApp) throw new CodexUnavailableError();
  const task = await window.forgerApp.startCodexTask({
    templateId: "scan_gmail_for_leads",
    arguments: {
      sinceIso: toArg(args.sinceIso),
      callbackBaseUrl: toArg(args.callbackBaseUrl),
      knownEmails: toArg(JSON.stringify(args.knownEmails)),
    },
  });
  return awaitCompletion(task.runId);
}
