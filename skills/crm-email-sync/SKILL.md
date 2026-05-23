---
name: crm-email-sync
description: Use when the user asks CRM Lite to sync emails from their connected Gmail account, or to send a follow-up email from inside CRM Lite. The agent uses the Gmail official tool exposed by Forger Desktop to read and send messages, then logs activities into CRM Lite via the import-external endpoint. CRM Lite never holds Gmail credentials directly.
---

# CRM Email Sync

This skill is for the agent, not for the end user.

Use it when the user wants to ingest Gmail messages into CRM Lite as activities, or to send a follow-up email from a deal or contact through their connected Gmail account.

## Source of Truth

Read the app `AGENTS.md` and the workspace `AGENTS.md` before using this skill. If this skill and `AGENTS.md` appear to conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"Si conectaste tu Gmail en Forger, CRM Lite registra automáticamente los correos con tus contactos como actividades, y puedes enviar follow-ups desde un deal o contacto sin salir de la app."

Avoid wording like:

- "Voy a llamar al endpoint `gmail.search_messages`."
- "Estoy haciendo `POST /api/activities/import-external`."
- "El refresh token está en `secrets-store`."

CRM Lite uses Forger Desktop's official Gmail tool. Connection management lives in Desktop's Tools view, not in CRM Lite. If Gmail is not connected, the answer to the user is "conecta Gmail en la vista Tools de Forger" — never offer to enter a password directly.

## Required Tool Surface

CRM Lite's `manifest.json` declares Gmail under `tools.required` with these actions:

- `gmail.connection.status`
- `gmail.search_messages`
- `gmail.read_thread`
- `gmail.send_email`

If any of these is unavailable (not active, not connected, or in error), Desktop returns a structured failure with a `technicalCode`. Surface that to the user in product language:

- `tool_not_active` → "Gmail no está activada en Forger. Actívala en la vista Tools."
- `tool_not_configured` → "Gmail está activada pero falta conectar la cuenta. Conéctala en la vista Tools de Forger."
- `gmail_oauth_not_connected` / `forger_account_required` → same as above, plus "Inicia sesión en Forger primero."

## Sync Flow (read)

When the user asks "sincroniza mis emails", "loguea los emails recientes con Acme", "trae los últimos correos de Pedro":

1. Confirm Gmail is connected.
   - Call `gmail.connection.status`. If `connected=false`, stop and explain.

2. Build a search query the user implied. Examples:
   - "emails con Acme" → look up the organization domain (e.g. `acme.cl`) and use `from:@acme.cl OR to:@acme.cl newer_than:30d`.
   - "emails con Pedro" → resolve the contact's email and use `from:pedro@acme.cl OR to:pedro@acme.cl newer_than:30d`.
   - "emails recientes con todos mis contactos" → fetch contact emails via `GET /api/contacts?page_size=200`, then issue separate `gmail.search_messages` calls per contact (Gmail's `OR` query length is capped). Cap to a reasonable batch (≤25 contacts per turn).

3. For each search hit, call `gmail.read_thread` once per thread to get headers + body. Avoid calling `read_thread` twice for the same thread.

4. For every message in the thread that matches a contact:
   - Build an `ActivityExternalImport` payload.
   - Set `kind="email"`, `external_provider="gmail"`, `external_message_id=<RFC 822 Message-Id>`, `external_thread_id=<thread id>`.
   - Use the email's `Date` header as `completed_at` (already happened — emails are logged as completed activities).
   - Use the email's `From` and `To` headers as `from_email` and `to_email`.
   - Use the email's `Subject` as `subject`. Truncate to 200 chars if longer.
   - Use the plain-text body as `body`. Truncate to 20000 chars; the Activity body limit is 20000.
   - Set `match_by_emails` to all participant emails (`From` + `To` + `Cc`) so the backend can resolve the contact even if the agent missed the explicit anchor.
   - Optionally set `deal_id` if you can identify the deal context (e.g. the user said "para el deal Q2").

5. POST each payload to `/api/activities/import-external`. The endpoint is idempotent on `(external_provider, external_message_id)`. Re-running the sync is safe.

6. Skip messages whose participants don't match any existing CRM Lite contact. Do not create contacts automatically — the user has to confirm before that.

7. Report back:
   - Total emails read.
   - How many were logged as new activities.
   - How many were duplicates (already imported).
   - How many were skipped because no contact matched.
   - The deal/contact list with new activity counts.

## Send Flow (write)

When the user asks "envía un follow-up al deal X" or clicks the **Componer email** button in CRM Lite:

### Path A — from the Componer email dialog

The dialog stages a draft as an `Activity` row with `kind="email"`, `pending_send=true`, and the body the user typed. The user copies a prompt the dialog generated to the chat. The prompt looks like:

> Envía el borrador pendiente con id `<activity-id>` desde mi Gmail al destinatario `<to>`, asunto "`<subject>`". Después de enviarlo, marca esa actividad como completada y registra el message-id de Gmail.

Steps when you receive that prompt:

1. `GET /api/activities/{activity-id}` to fetch the staged draft. Confirm `pending_send=true`. If false, the user already sent it; stop and inform.
2. Confirm Gmail connection status (same as Sync Flow step 1).
3. Call `gmail.send_email` with `{ to, subject, body }` from the staged activity. Forger Desktop opens the consent flow if the user has not approved this action yet.
4. On success Gmail returns the new message id. Update the staged activity:
   - `PATCH /api/activities/{activity-id}` with `{ pending_send: false, completed_at: <ISO now>, body: <final body sent>, to_email: <recipient> }`.
   - If the API exposes `external_message_id` on PATCH later, also set it. For v0.2 the easier path is to delete the staged draft and re-import via `import-external` so the Gmail message-id gets persisted. Pick whichever flow the user prefers; default to PATCH for fewer round trips.
5. Report: "Email enviado a `<to>` y registrado como actividad completada del deal X."

### Path B — direct request from chat

The user might say "envía un follow-up para el deal Q2 de Acme" without using the dialog. In that case:

1. Resolve the deal and contact via search or by id the user gave you.
2. Draft the email body using `crm-followup-draft` (or your own composition if the user already gave the body).
3. Always show the draft to the user and ask explicit confirmation before sending. Sending is a high-risk action.
4. On confirmation, call `gmail.send_email`.
5. Then `POST /api/activities/import-external` with the new email. Use the message-id Gmail returned, `completed_at=<now>`, and `match_by_emails=[<recipient>, <user's gmail>]`.

## Boundaries

- Do not send any email without explicit user confirmation of the body and recipient.
- Do not auto-create new contacts when an unmatched email shows up. Offer it as a separate question.
- Do not attempt OAuth, password entry, or app-password configuration. Connection lives in Desktop's Tools view.
- Do not log emails from contacts the user explicitly excluded — but in v0.2 exclusion is not modeled, so default to "match exact contact email only".
- Do not call `gmail.read_attachment` automatically. Only fetch attachments when the user asks for a specific file.
- Multi-currency is irrelevant here — money values do not appear in email sync.
- Calendar sync is **not** part of this skill. There is no calendar tool exposed by Desktop yet. If the user asks for it, say so honestly.
