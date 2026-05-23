# CRM OS — external integrations status

This file tracks the integrations that need work outside CRM OS (in Forger Desktop or Forger Cloud) before CRM OS can consume them.

## Email — Gmail

**Status: shipped in v0.2.**

CRM OS consumes Gmail through Forger Desktop's official Gmail tool. The full chain looks like this:

- Forger Cloud holds the Google OAuth `client_id` and `client_secret`.
- Forger Desktop runs the OAuth dance via `runGmailOAuthFlow` (PKCE + loopback callback), exchanges the auth code through Forger Cloud, and stores the refresh token locally in its `secretsStore`.
- CRM OS declares `gmail` under `tools.required` in `manifest.json` with the actions it uses (`gmail.connection.status`, `gmail.search_messages`, `gmail.read_thread`, `gmail.send_email`).
- The agent (running inside Forger Desktop with an MCP session) calls those actions on behalf of CRM OS when the user requests a sync or a send.
- For sync: the agent posts each Gmail message to `POST /api/activities/import-external`. Idempotent on `(external_provider, external_message_id)`.
- For send: CRM OS stages a draft as an `Activity` with `pending_send=true`. The agent picks it up by id, calls `gmail.send_email`, then marks the activity completed.

CRM OS never stores Gmail credentials and never opens an OAuth browser tab on its own.

## Email — Outlook / Microsoft 365

**Status: blocked on Forger Desktop adding a Microsoft Graph official tool.**

When Desktop adds a `microsoft` tool with the equivalent shape (a connection action plus `microsoft.search_messages`, `microsoft.read_thread`, `microsoft.send_email`), CRM OS plugs it in by adding a second entry under `tools.required` and an `external_provider="microsoft"` branch in the email sync skill. No further OAuth work in CRM OS.

What Forger needs to do (one-time):

1. Register an application in Azure AD with supported account types `Personal Microsoft accounts + work/school accounts`.
2. Add a public-client redirect URI for `http://localhost`.
3. Add Microsoft Graph delegated permissions: `Mail.Read`, `Mail.Send`, `offline_access`.
4. Submit Publisher Verification.
5. Implement a `microsoft` tool module under `desktop/src/main/tools/microsoft/` that mirrors `gmail/`.

## Calendar — Google / Microsoft

**Status: blocked on Forger Desktop adding an official Calendar tool.**

There is currently no calendar code in `desktop/src/main/tools/`. The only mention of `calendar` in the desktop codebase is a CSS pseudo-element in `AutomationsView.tsx`. Until a `calendar` tool ships in Desktop, CRM OS cannot read calendar events or push meetings.

What Forger needs to do (one-time, per provider):

### Google Calendar

1. Enable the Google Calendar API in the Google Cloud Project Forger already owns for Gmail.
2. Add the scope `https://www.googleapis.com/auth/calendar.readonly` to the OAuth Consent Screen.
3. Submit for sensitive-scope verification (it can ride alongside the existing Gmail submission). Expect 2–4 weeks added to the timeline.
4. If two-way calendar (writing events) is desired, add `calendar.events`. This is a restricted scope and triggers a CASA-tier security audit, $15K–$75K typical. v0.2 calendar stays read-only to avoid that.
5. Implement a `google_calendar` tool module under `desktop/src/main/tools/google_calendar/` reusing the same OAuth/refresh helpers Gmail already uses (the refresh-token endpoint is identical, only scopes differ).

### Microsoft Calendar

1. Add `Calendars.Read` (and later `Calendars.ReadWrite`) to the Microsoft application registration above.
2. Implement a `microsoft_calendar` tool module mirroring the same shape.

## What CRM OS delivers when calendar unblocks

When either calendar tool ships in Desktop, CRM OS will:

- Add a second entry under `manifest.json` `tools.required` declaring the calendar actions it uses.
- Extend `Activity` ingestion to accept `kind="meeting"` from the agent through the same `POST /api/activities/import-external` path. Add an `external_event_id` column or reuse `external_message_id` (decision pending until we see the Calendar tool's response shape).
- Add a second card to Settings → Conexiones with calendar sync stats.
- Document the new flow in `skills/crm-email-sync/SKILL.md` or split it into a `crm-calendar-sync` skill.

This stays small because the platform layer (OAuth, token storage, MCP exposure) keeps being Desktop's responsibility.
