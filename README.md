# crm-os

Local-first CRM operating system for small B2B pymes. Built on the `vite-fastapi-sqlite` Forger stack.

CRM OS keeps contacts, organizations, deals, activities, notes, custom fields, products, and quotes on the user's machine. It is single-user (one operator, no auth, no portal) and replaces a cloud CRM like Pipedrive or HubSpot Starter for a Pyme that does not want its sales pipeline in a third-party SaaS. CRM OS supersedes the earlier `crm-lite` MVP, which is now deprecated.

## Stack

- Backend: Python 3.12 + FastAPI + SQLModel + SQLite, packaged with `uv`.
- Frontend: Vite + React 18 + MUI 6, with `react-router-dom` and `@dnd-kit/core` for the pipeline Kanban.
- Shared infrastructure: `commons/` submodule (`vite-fastapi-sqlite-commons`).
- Gmail sync and send through Forger Desktop's official Gmail tool — no credentials stored in CRM OS.

## Stack Common Dependency

- Required submodule: `commons/`
- Expected remote: `git@github.com:forger-ai/vite-fastapi-sqlite-commons.git`
- Docker mounts files from `commons/` over local fallbacks:
  - `backend/src/app/database.py`
  - `backend/src/app/health.py`
  - `backend/src/app/cors.py`
  - `frontend/src/api/client.ts`

## Current scope (v0.1)

CRM OS v0.1 ships everything CRM Lite reached at v0.2 plus three new modules:

### Inherited from CRM Lite

- Contacts and organizations with many-to-many relationships.
- Configurable pipelines with custom stages (default `Ventas` pipeline seeded on first run).
- Deals with amount, currency, probability, expected close date, and stage history.
- Typed activities (`call`, `email`, `meeting`, `task`) and free-form notes attached to deal/contact/organization.
- Custom fields per entity (`text`, `number`, `date`, `select`, `bool`).
- Free-text value registry for autocomplete on open fields.
- CSV import for contacts and organizations with dry-run preview.
- Reports: pipeline value by stage, won/lost by month, activities overview, stage conversion, weekly summary.
- Global search across organizations, contacts, and deals.
- Gmail sync and send via Forger Desktop's official tool (idempotent, contact-matched).

### New in CRM OS v0.1

- **Product catalog**: SKU (unique when set), name, description, category, default unit price, currency, archive flag.
- **Quotes with line items**: per-deal quotes with productos del catálogo or líneas libres, descuentos por línea, IVA editable (default 19%), totales auto-calculados, numeración anual `Q-YYYY-NNN`, máquina de estados (draft → sent → accepted | rejected | expired) y expiración lazy por `valid_until`.
- **Heuristic lead scoring** (0–100, sin LLM): factor `stage_probability` (30 pts), `recent_engagement` (25), `inbound_reply` (20), `freshness` (15), `amount_pressure` (10). Computado on-demand desde data observable; expone cada factor con explicación humana. Dashboard muestra Hot leads / Cold deals.

## Roadmap (out of scope today)

- Calendar sync (Google/Outlook) — blocked on Forger Desktop adding an official Calendar tool. Tracker: [docs/external-integrations.md](docs/external-integrations.md).
- Outlook / Microsoft 365 email sync — pending Microsoft Graph official tool in Forger Desktop.
- Quote PDF rendering and external sending — the user copies / forwards quotes manually for now.
- LLM-augmented lead scoring as opt-in factor.
- Inventory / stock levels for products.
- Recurring billing / invoicing.
- Automated email sequences or cadences.
- Web capture forms, multi-user, permissions — out of the Forger model.

## Local development

Recommended path (Docker Compose with `commons/` mounts):

```bash
docker compose up --build
```

Services:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5183`
- Health: `GET http://localhost:8000/api/health`

Fallback without Docker:

```bash
cd backend && uv sync && uv run fastapi dev src/app/main.py
cd frontend && npm install && npm run dev
```

## Verify

```bash
cd backend && uv run pytest
cd frontend && npm run verify
```

Or, from the repo root: `npm run verify` (defined in `manifest.json`).

## Packaging

```bash
scripts/package_app.sh
```

Generates a distributable ZIP under `tmp/dist/` excluding `.git`, `node_modules`, virtual envs, build outputs, and local SQLite databases.

## Relationship with crm-lite

`apps/crm-lite/` is deprecated. CRM OS is the canonical CRM for the Forger catalog. CRM Lite remains in the workspace as historical reference until it gets removed; its manifest is flagged `deprecated: true` and `supersededBy: "crm-os"`.
