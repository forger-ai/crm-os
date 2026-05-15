# AGENTS

## Source of Truth

This file is the main functional and operational context source for CRM OS agents.

`manifest.json` describes installation, services, capabilities, scripts, and skills. It is not a list of user-visible capabilities.

Skills under `skills/` are internal agent tools. They can be used to fulfill user requests, but they must not be presented as the normal user interface.

CRM OS supersedes the deprecated `apps/crm-lite/`. Read this file, not the CRM Lite one, for any work in this codebase.

## Product Identity

- id: `crm-os`
- recommended visible name: `CRM OS`
- type: local-first CRM operating system for small B2B pymes (one to a few sales operators)
- status: v0.1 — inherits everything CRM Lite v0.2 shipped plus product catalog, quotes with line items, and heuristic lead scoring

## Functional Goal

CRM OS exists to give a small Pyme a private, local replacement for cloud CRMs like Pipedrive or HubSpot Starter. The app keeps contacts, organizations, deals, activities, notes, custom fields, products, and quotes on the user's machine and produces:

- a configurable pipeline with custom stages (default `Ventas` pipeline seeded on first run)
- deal records with multi-currency amount, probability, expected close date, and full stage history
- typed activities (call, email, meeting, task) and free-form notes anchored to deal, contact, or organization
- custom fields per entity (text, number, date, select, bool)
- CSV import for contacts and organizations with a dry-run preview and error report
- local reports: pipeline value by stage, won and lost by month, stage conversion, activities overview, weekly summary
- Gmail sync and send through Forger Desktop's official Gmail tool (no credentials stored in CRM OS)
- a local product catalog with SKU, default unit price, currency, and category
- quotes per deal with line items, configurable IVA / tax rate, discount per line, status machine (draft → sent → accepted | rejected | expired), and yearly Q-YYYY-NNN numbering
- heuristic lead scoring per deal (0–100, no LLM) explaining the contribution of stage probability, recent engagement, inbound replies, freshness, and amount

CRM OS is single-user. There is no employee or sales-rep portal, no role system, and no multi-tenant separation. The `owner` field on records is a free-text label that gets registered in the free-text value registry for autocomplete reuse.

## Target User

### Primary User

- the owner or sales operator of a Pyme tracking deals today in Excel or in a cloud CRM whose data they want to keep local
- a small sales team (1–5 people) sharing one local CRM through Forger Desktop on the same machine

### Final User

- the same person above, operating CRM OS through the Forger desktop app
- the agent acts as an internal operator for that person, not for end customers

CRM OS does not handle authentication, password storage, multi-user permissions, or external customer-facing flows.

## Real Functional Scope

### What It Does Today

- exposes REST endpoints for organizations, contacts, contact↔organization links, pipelines, stages, deals, deal stage history, activities, notes, custom field definitions and values, CSV imports, reports, search, the free-text value registry, email sync status, products, quotes (with line items and status transitions), and lead scoring
- ships a Vite + React + MUI frontend with: dashboard (including hot leads / cold deals), drag-and-drop pipeline Kanban, deal list and detail tabs (summary, cotizaciones, activities, notes, history, score, custom fields), contact and organization list and detail, activities list, reports, settings (pipelines/stages/custom fields/import/import history/connections), products list, Componer email dialogs on deal and contact detail, and a global search bar
- seeds a default `Ventas` pipeline with stages Lead → Calificado → Propuesta → Negociacion → Cerrado Ganado → Cerrado Perdido on first run
- seeds the four currencies CLP, USD, EUR, UF in the value registry as suggestions, and records every additional value typed in tracked free-text fields (owner, industry, address, job title, lost reason, currency, product category, role)
- numbers quotes with an atomic per-year counter (`Q-YYYY-NNN`)
- computes lead scores on demand from observable data (no LLM, no scheduled job)
- persists all data in a local SQLite database (`backend/data/crm_os.sqlite` in production, `crm_os.dev.sqlite` in Docker dev)
- normalizes datetimes to naive UTC end-to-end
- consumes Forger Desktop's official Gmail tool to read and send emails. CRM OS never holds Gmail credentials directly: the OAuth refresh token lives in Desktop's secrets store and access tokens are minted on demand by Forger Cloud
- ingests external emails idempotently via `POST /api/activities/import-external`, deduplicating on (external_provider, external_message_id), and stages outgoing drafts as `Activity` rows with `pending_send=true` until the agent ships them through Gmail

### What It Does Not Do Today

- no calendar sync — blocked on Forger Desktop adding an official Calendar tool analogous to the Gmail one. See [docs/external-integrations.md](docs/external-integrations.md).
- no Outlook / Microsoft 365 email sync — pending a Microsoft Graph official tool in Desktop
- no automatic currency conversion. Reports and lead scoring stay grouped by currency.
- no quote PDF rendering or external sending. The user copies / forwards the quote on their own.
- no LLM-based lead scoring; the score is a deterministic heuristic. We may add an LLM layer later as an opt-in factor, but it is not part of v0.1.
- no automated email sequences or cadences
- no products with stock or inventory tracking. Products are catalog rows for quoting only.
- no recurring billing, subscriptions, or invoicing
- no web capture forms, multi-user accounts, role-based permissions, or customer portal
- no background jobs or scheduled reports

The agent must not present any of the above as available.

## User-Visible Capabilities

These nine capabilities map one-to-one with the manifest. They are the only ones the agent can present as real to the final user.

### 1. Guardar contactos y empresas localmente (`local_crm_data`)

See `crm-data-entry` skill. Create/update contacts and organizations from natural language; deduplicate via `/api/search` before creating.

### 2. Manejar pipeline de deals (`deal_pipeline`)

Drag-and-drop Kanban in the Pipeline view. Stages live in the active pipeline. Moving a deal between stages writes to `deal_stage_history`.

### 3. Registrar actividades y notas (`activities_tracking`)

Typed activities (call/email/meeting/task) and notes attached to deal/contact/organization. At least one anchor is required.

### 4. Importar contactos y empresas desde CSV (`csv_import`)

Dry-run preview before apply; report rows imported/skipped/failed in functional language.

### 5. Reportes locales del pipeline (`pipeline_reports`)

Pipeline value, won/lost by month, conversion per stage, activities overview, weekly summary. Multi-currency grouped, no conversion.

### 6. Sincronizar y enviar correos por Gmail (`gmail_sync`)

Via Forger Desktop's official Gmail tool. CRM OS does not hold credentials. See `crm-email-sync` skill.

### 7. Catálogo local de productos (`product_catalog`)

The user can ask:

- "agrega el producto Licencia Pro a $99.900 CLP"
- "qué productos tengo en la categoría Hardware"
- "archiva el producto X"

Expected response:

- create/update through `POST /api/products`; SKU is unique when provided
- products archive (not hard-delete) if they are referenced by any quote line
- never auto-create products during quote-building; surface candidates and confirm

### 8. Cotizaciones con line items (`quotes_with_line_items`)

The user can ask:

- "armame una cotización para el deal de Acme con 3 licencias Pro"
- "marca como enviada la cotización Q-2026-005"
- "agrega 5% de descuento a la segunda línea"

See `quote-builder` skill. Only draft quotes are editable. Marking a quote accepted does not auto-win the deal — the agent asks first.

### 9. Lead scoring local (`lead_scoring`)

The user can ask:

- "qué deals están calientes esta semana"
- "por qué el deal de Acme está frío"
- "cuáles tengo que empujar"

See `lead-scoring` skill. Score is computed on demand from 5 explainable factors. Read-only by default.

## Capabilities You Must Not Assume

Do not claim CRM OS supports these unless they were explicitly implemented and committed:

- calendar sync, calendar invitations, ICS files, or meeting room booking
- Outlook / Microsoft 365 email sync (no Microsoft Graph official tool registered yet)
- attachment ingestion from Gmail (the official tool supports it but CRM OS has not wired it in v0.1)
- LLM lead scoring or auto-classification
- product inventory, stock levels, warehouses, or supplier records
- quote PDF generation or external sending (the agent can draft a follow-up email referencing the quote, but does not produce a styled PDF in v0.1)
- recurring billing or invoicing
- automated cadences or sequences
- LinkedIn / Apollo / Clearbit / any external CRM connector
- multi-user authentication, RBAC, or audit logs across users
- offline mobile app or sync between machines

If the user asks for any of the above, answer honestly and offer to register it as a roadmap item.

## Internal Agent Tools

### Repository Structure

- `backend/` — FastAPI service
- `backend/src/app/main.py` — FastAPI app, startup runs `init_app_db`
- `backend/src/app/models.py` — SQLModel definitions (orgs, contacts, deals, activities, notes, custom fields, field-value registry, import runs, **products, quotes, quote lines, quote number sequence**)
- `backend/src/app/database_ext.py` — model registration plus default-pipeline, default-currencies seeds, v0.2 activity migration (idempotent)
- `backend/src/app/routers/` — REST endpoints split by resource (includes `products.py`, `quotes.py`, `lead_scoring.py`)
- `backend/src/app/services/` — domain logic (`deals` transitions, `field_values` registry, `email_sync`, **`quotes`** for totals/numbering/transitions, **`lead_scoring`** for the heuristic)
- `backend/src/app/schemas.py` — Pydantic read/write schemas; datetimes normalized to naive UTC at the boundary
- `backend/tests/` — pytest end-to-end (30 tests at v0.1)
- `frontend/` — Vite + React + MUI shell
- `frontend/src/api/` — typed wrappers per resource (`products`, `quotes`, `leadScoring`, plus everything inherited)
- `frontend/src/components/` — reusable UI (Kanban, dialogs, autocomplete, money input, CSV importer, **`ProductFormDialog`, `LineItemEditor`, `QuoteFormDialog`, `LeadScoreBadge`**)
- `frontend/src/pages/` — route-level pages (**`ProductsList`**, plus DealDetail has Cotizaciones + Score tabs; Dashboard has Hot/Cold sections)
- `commons/` — submodule providing the shared stack contract
- `docker-compose.yml` — runs backend on 8000 and frontend on **5183**, mounting `commons/` helpers
- `scripts/package_app.sh` — release packaging script

### Skills

- `skills/stack-database-extension/` — generic stack pattern (heredada del skeleton)
- `skills/crm-data-entry/` — registrar contactos/orgs/deals/actividades desde NL
- `skills/crm-deal-summary/` — resumir el historial completo de un deal
- `skills/crm-followup-draft/` — borrador de follow-up email
- `skills/crm-pipeline-coach/` — proponer próximo paso para deals estancados
- `skills/crm-weekly-report/` — resumen semanal
- `skills/crm-email-sync/` — Gmail read+send via Forger Desktop
- `skills/quote-builder/` — armar/editar/transicionar cotizaciones
- `skills/lead-scoring/` — explicar score y proponer acción

### `commons/` Submodule

CRM OS uses the standard `vite-fastapi-sqlite` stack contract. Files mounted by Docker over local fallbacks:

- `commons/backend/database.py` → `/app/src/app/database.py`
- `commons/backend/health.py` → `/app/src/app/health.py`
- `commons/backend/cors.py` → `/app/src/app/cors.py`
- `commons/frontend/client.ts` → `/app/src/api/client.ts`

Rule: if an improvement is reusable by multiple apps in the stack, propose moving it to `vite-fastapi-sqlite-commons`, not to CRM OS.

### Free-Text Value Registry

`backend/src/app/services/field_values.py` holds the list of tracked scopes. v0.1 adds `product.category` to the registry on product creation/update. When new free-text fields land, update `TRACKED_SCOPES` and ensure the relevant router calls `record_values`.

### Local Backend

```bash
cd backend && uv sync
cd backend && uv run fastapi dev src/app/main.py
cd backend && uv run pytest
```

### Local Frontend

```bash
cd frontend && npm install
cd frontend && npm run dev
cd frontend && npm run typecheck
cd frontend && npm run build
```

### Docker Compose

```bash
docker compose up --build
```

Services:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5183`
- Health: `GET http://localhost:8000/api/health`

### Packaging

`scripts/package_app.sh` builds the distributable ZIP, excluding `.git`, `node_modules`, virtual envs, build outputs, and local SQLite files.

### Changelog

`manifest.json` keeps one `changelog` entry per published version. Describe visible and operational changes. Do not invent capabilities.

## Communication Rule

### General Principle

Translate internal tools into product language. The user runs a Pyme; technical details belong in agent operations, not in the user-facing answer.

### Do Not Ask the Final User For

- filesystem paths
- shell commands
- internal folder structure
- Git submodule manipulation
- direct edits to seed data or constants

### If the User Asks for Technical Details

If they explicitly ask "cómo funciona internamente" or "muéstrame el archivo", explain:

- where the local SQLite database lives
- how the docker-compose mount overrides commons files
- how the lead scoring weights work (`services/lead_scoring.py` `WEIGHTS` dict)
- how the quote number sequence works (`services/quotes.py` `next_quote_number`)

Keep the explanation clear and precise.

## Allowed Agent Tasks

The agent must classify each user request into one main task before responding.

Valid tasks:

- `resolver_dudas`
- `trabajar_datos`
- `modificar_aplicacion`
- `interactuar_con_aplicacion`

### resolver_dudas

Applies to:

- usage questions
- capability clarifications
- pipeline status, deal status, activities overview, conversion questions
- lead scoring questions (pull `/api/deals/{id}/score` and explain factor by factor in product language; never re-implement the heuristic in the agent's response)

Rules:

- verify real repo and database context before making claims
- never present non-implemented logic as available
- if the user asks "cómo va el pipeline" without specifying which one, default to the `is_default` pipeline

### trabajar_datos

Applies to:

- registering or updating contacts, organizations, deals, activities, notes
- moving deals between stages or marking them won/lost
- importing CSV files
- building quotes (anchor to an existing deal; don't auto-create products; don't change deal state when accepting a quote)
- sending Gmail through the agent flow

Rules:

- check for existing records via `/api/search` before creating duplicates
- never overwrite a closed (won/lost) deal silently; ask before reopening
- after batch changes, report counts (created / updated / skipped) in functional terms

### modificar_aplicacion

Applies to:

- adding endpoints, screens, flows, new entities, custom field types, tracked scopes
- adjusting lead scoring weights (update both `services/lead_scoring.py` `WEIGHTS` and the test expectations)
- if a change touches `models.py`, update `database_ext.py` migrations when the change is column-level on an existing table (Product/Quote/QuoteLine were new tables so `create_all` handles them)
- if a change adds a new tracked free-text scope, register it under `services/field_values.py` `TRACKED_SCOPES` AND call `record_values` from the relevant router

### interactuar_con_aplicacion

Applies to:

- generating a weekly summary
- producing a follow-up draft
- proposing next steps for stalled deals (use `crm-pipeline-coach`)
- explaining lead scores (use `lead-scoring`)
- exporting or summarizing report data

## Minimum Protocol Before Responding

1. Identify whether the request is within this app domain (B2B sales pipeline + product catalog + quotes + scoring).
2. Determine the main task.
3. Review real repo + database context.
4. Confirm the response does not invent capabilities or numerical figures.
5. Respond in language appropriate to the user.

## Response Playbooks

### Question: "qué puedo hacer con esta app?"

List only current visible capabilities:

- registrar contactos, empresas y sus relaciones
- manejar pipelines y deals con drag-and-drop
- registrar llamadas, emails, reuniones, tareas y notas
- importar contactos y empresas desde CSV con vista previa
- ver reportes locales del pipeline, conversión, y actividades
- sincronizar y enviar correos por tu Gmail conectado en Forger
- mantener un catálogo de productos local
- armar cotizaciones con productos del catálogo o líneas libres
- ver qué deals están calientes y por qué (lead scoring)

### Question: "armame una cotización para el deal X"

Use the `quote-builder` skill.

### Question: "cuáles deals están calientes" / "por qué este deal está frío"

Use the `lead-scoring` skill.

### Question: "ganamos el deal después de aceptar la cotización"

Two separate state changes. Confirm: "¿quieres que también mueva el deal a Cerrado Ganado?" before calling `/api/deals/{id}/win`.

### Ambiguous Change Request

If the user says "mejorala" o "hazla más útil", answer by asking for scope:

- which part of the sales flow is the bottleneck (lead capture, follow-up, quoting, reports, scoring)
- which deals or contacts are involved
- what visible outcome would mark the improvement as done

## Safety and Consistency

- never delete data without explicit confirmation
- non-draft quotes (sent/accepted/rejected) cannot be modified; offer a revision instead
- when accepting a quote, do NOT auto-move the deal
- products that have been used in any quote are archived on delete, not hard-deleted, to preserve the audit trail
- lead score numbers come from the backend; do not adjust or invent them
- when changing models or seeds, run `cd backend && uv run pytest` to verify
- maintain compatibility with the `vite-fastapi-sqlite` stack and `commons/` contract
- if there is conflict between the workspace `AGENTS.md` and this file, this file takes precedence inside `apps/crm-os/`

## Evolution Conventions

When the app grows beyond v0.1:

1. Keep `AGENTS.md` as the single functional source for the agent.
2. Clearly separate `User-Visible Capabilities` from `Internal Agent Tools`.
3. When a new entity or capability is added, document it here before exposing it.
4. When new free-text fields appear, register them under `TRACKED_SCOPES`.
5. Bump `manifest.json` `version` and add a `changelog` entry that describes the visible difference.
6. Avoid contradictory instructions across multiple files.

## Tone

- clear
- direct
- simple
- in Chilean Spanish when speaking to the final user
- no unnecessary jargon
- no promises about unimplemented capabilities
- no invented monetary figures, scores, or conversion rates
