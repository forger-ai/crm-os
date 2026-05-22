import { useEffect } from "react";
import { API_BASE_URL } from "../api/client";
import { isForgerDesktop, runScanGmailForLeads } from "../api/codex";
import { listContacts } from "../api/contacts";
import { getIntakeConfig } from "../api/intake";

// Delay before the first scan so it does not race app startup.
const FIRST_RUN_DELAY_MS = 20 * 1000;
// Used to schedule the next cycle when the config fetch fails.
const FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

async function collectKnownEmails(): Promise<string[]> {
  try {
    const contacts = await listContacts({ page_size: 200 });
    return contacts
      .map((c) => c.email)
      .filter((e): e is string => !!e && e.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Polls Gmail for new leads while the app is open.
 *
 * The polling lives in the frontend because the CRM backend is passive and
 * cannot reach Gmail; the agent does. Each cycle re-reads the interval from
 * `IntakeConfig.poll_interval_minutes`, so changing it in Settings takes
 * effect on the next cycle without a remount. The next cycle is scheduled
 * only after the current one finishes, so scans never overlap. The whole
 * hook is a no-op outside Forger Desktop.
 */
export function useLeadPolling(): void {
  useEffect(() => {
    if (!isForgerDesktop()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const runCycle = async () => {
      if (cancelled) return;
      let nextDelayMs = FALLBACK_INTERVAL_MS;
      try {
        const config = await getIntakeConfig();
        nextDelayMs = Math.max(1, config.poll_interval_minutes) * 60 * 1000;
        if (!cancelled && config.enabled) {
          const knownEmails = await collectKnownEmails();
          await runScanGmailForLeads({
            sinceIso: config.since_iso,
            callbackBaseUrl: API_BASE_URL,
            knownEmails,
          });
        }
      } catch {
        // Best-effort; the cycle is retried after the fallback delay.
      }
      if (!cancelled) {
        timer = setTimeout(() => void runCycle(), nextDelayMs);
      }
    };

    timer = setTimeout(() => void runCycle(), FIRST_RUN_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
}
