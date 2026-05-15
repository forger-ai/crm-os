---
name: crm-pipeline-coach
description: Use when the user asks "qué deal está atascado", "dame un próximo paso", "qué tengo que hacer hoy". Identifies stalled deals via the weekly summary and proposes a concrete next action per deal based on stage and history. Read-only; never moves stages or creates activities without explicit user confirmation.
---

# CRM Pipeline Coach

This skill is for the agent, not for the end user.

Use it when the user wants direction on the open pipeline rather than a passive report.

## Source of Truth

Read the app `AGENTS.md` before using this skill. If this skill and `AGENTS.md` conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"CRM Lite te puede mostrar dónde se está estancando el pipeline y proponerte un próximo paso concreto para los deals que llevan tiempo sin moverse."

Avoid wording like:

- "Voy a llamar a `/api/reports/weekly-summary` y procesar los datos."

## Internal Workflow

1. **Pull aggregate state.**
   - `GET /api/reports/weekly-summary` returns `stale_deals` (open deals with no stage change and no creation movement in 30 days), `pipeline_value`, `deals_open`, won/lost del semana, and `activities` overview (overdue, due_today, due_this_week, completed_last_30_days).
   - For deeper view per pipeline, also call `GET /api/reports/pipeline-value?pipeline_id=<id>`.

2. **Pick the focus list.**
   - Start with `stale_deals`, capped at 5.
   - If `stale_deals` is empty, escalate to deals with overdue activities by listing `GET /api/activities?completed=false&due_to=<today>` and grouping by `deal_id`.
   - If both lists are empty, surface the largest open deals by amount in the active currency: `GET /api/deals?status=open&page_size=5` and read the response.

3. **For each deal, propose a next step.**
   - Pull `GET /api/deals/{id}` to know stage, last stage change, last activity, and last note.
   - Map stage → suggested action:
     - `Lead`: "Calificar: agendá una primera llamada de 15 minutos."
     - `Calificado`: "Mandar propuesta o ficha técnica."
     - `Propuesta`: "Pedir feedback de la propuesta enviada el dd/mm."
     - `Negociacion`: "Cerrar fecha y monto. Si no responde, mandar nota de cierre."
     - Custom stages: use the stage name + "preguntar al usuario qué siguiente acción aplica."
   - When the deal has overdue activities, the suggestion is "completar la actividad pendiente: `<subject>`."
   - When the last note flags a blocker (e.g. "espera precios"), surface that text in the suggestion.

4. **Format the output.** A short list grouped by urgency:
   - Vencidos hoy / esta semana → primero.
   - Estancados (>30 días) → después.
   - Más grandes en monto → al final.
   Each line: deal title, stage, propuesta de próximo paso. Limit to 5 deals total to keep it actionable.

5. **Offer follow-up.** End with one sentence offering to (a) crear las actividades sugeridas via `crm-data-entry`, (b) generar borradores via `crm-followup-draft`, or (c) mover de stage. Ask before doing any of those.

## Boundaries

- Read-only by default. Never call `POST /api/deals/{id}/move`, `/win`, `/lose`, or create activities without explicit user confirmation.
- Do not invent deals, amounts, due dates, or stage names that are not in the data.
- If the data shows nothing actionable, say so honestly. Do not pad the list to look productive.
- Keep currency formatting grouped by currency (no automatic conversion).
