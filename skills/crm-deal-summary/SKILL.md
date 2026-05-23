---
name: crm-deal-summary
description: Use when the user asks for the summary, history, or current status of a specific deal in CRM Lite. Pull the full deal record (with stage history, activities, notes, and custom fields) and produce a single readable narrative. Do not expose internal endpoints or schema fields directly to the user.
---

# CRM Deal Summary

This skill is for the agent, not for the end user.

Use it when the user wants to know "cómo va el deal X", "resumime el historial", "qué tenemos del deal con Acme".

## Source of Truth

Read the app `AGENTS.md` before using this skill. If this skill and `AGENTS.md` appear to conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"CRM Lite te puede contar la historia completa de un deal: cuándo entró al pipeline, por qué stages pasó, qué actividades tienes pendientes y qué se anotó."

Avoid wording like:

- "Voy a hacer GET a `/api/deals/{id}`."
- "Te muestro la respuesta del endpoint."

## Internal Workflow

1. **Identify the deal.**
   - If the user gives a deal id, use it directly.
   - If the user gives a title, run `GET /api/search?q=<title>` and pick the first hit in `deals`. Confirm with the user when there are multiple candidates.
   - If the user gives a contact or organization name, list their open deals via `GET /api/contacts/{id}` or `GET /api/organizations/{id}` (which include `open_deals`) and ask which one.

2. **Pull the full record.**
   - `GET /api/deals/{id}` returns the deal plus `stage_history`, `activities`, `notes`, and `custom_fields`.
   - Activities and notes are sorted by date in the response; respect that order.

3. **Build the summary.** Cover, in this order:
   - **Title and status.** Include the current stage, monto, currency, probabilidad, and expected close date if set.
   - **Owner and parties.** Empresa, contacto principal, owner del deal.
   - **Cómo se movió.** Walk through `stage_history` in chronological order, condensing repeated jumps. Highlight the most recent move and its date.
   - **Última actividad.** Pick the most recent completed activity and report subject + completion date. If there is none, say so.
   - **Pendientes.** List up to 3 open activities, ordered by `due_at` ascending. Mark vencidas explicitly.
   - **Notas relevantes.** Show up to 2 pinned notes verbatim. If no pinned notes, show the most recent note (truncated to ~30 words).
   - **Custom fields.** Mention any non-empty custom field values.

4. **Format.** A single short narrative paragraph, optionally followed by 2–4 bullet points for pendientes. No markdown headers, no JSON, no IDs unless the user asked for technical detail.

## Boundaries

- This skill is read-only. It must not modify the deal, complete activities, or move stages.
- This skill does not invent dates, amounts, or notes that are not present in the response.
- This skill does not reveal internal IDs, endpoint paths, or schema field names unless the user explicitly asks.
- If the deal is closed (won/lost), include that fact and the won_at/lost_at and the lost_reason if present.
