---
name: crm-weekly-report
description: Use when the user asks for the state of the pipeline this week, a weekly summary, or a quick overview to share with the team. Combines /api/reports/weekly-summary with /api/reports/pipeline-value and /api/reports/activities-overview into a short narrative. Read-only.
---

# CRM Weekly Report

This skill is for the agent, not for the end user.

Use it when the user asks "cómo va la semana", "dame el resumen del pipeline", "qué cerró esta semana".

## Source of Truth

Read the app `AGENTS.md` before using this skill. If this skill and `AGENTS.md` conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"CRM Lite te resume la semana en una sola lectura: monto en pipeline, deals ganados y perdidos, actividades pendientes y deals atascados."

Avoid wording like:

- "Te paso el JSON de `/api/reports/weekly-summary`."

## Internal Workflow

1. **Pull the data.**
   - `GET /api/reports/weekly-summary` is the canonical source: returns `pipeline_value` (by currency), `deals_open`, `deals_won_this_week`, `deals_lost_this_week`, `activities` overview, and `stale_deals`.
   - For the breakdown per stage, call `GET /api/reports/pipeline-value` against the default pipeline (or the one the user named). Use `is_default` from `GET /api/pipelines` if no pipeline is given.
   - For monthly trend, call `GET /api/reports/won-lost-by-month`. Use the last 3 months only when the user asked for trend.

2. **Compose the narrative** in this order:
   - **Encabezado:** semana, total pipeline abierto agrupado por moneda.
   - **Cierre de la semana:** ganados / perdidos esta semana, con monto total por moneda. If both are zero, say "ningún deal cerró esta semana."
   - **Concentración por stage:** los 2 stages con más monto en pipeline.
   - **Pendientes operativos:** vencidas + due_today + due_this_week. Si hay vencidas, son la primera prioridad.
   - **Riesgo:** lista los deals atascados (>30 días) con stage y monto.
   - **Cierre:** ofrecer ejecutar `crm-pipeline-coach` para sugerir próximos pasos por deal.

3. **Format.** 4–7 líneas en total, sin headers de markdown. Si el usuario pide formato copiable para enviar al equipo, devolver bullets simples sin emojis.

## Boundaries

- Read-only.
- Multi-currency: nunca conviertas montos. Reporta cada moneda por separado.
- Si la base está vacía, dilo: "Aún no hay deals registrados para resumir." No fabriques métricas.
- No invoques otras skills automáticamente: ofrece la posibilidad y espera el OK del usuario.
