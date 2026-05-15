---
name: crm-data-entry
description: Use when the user wants to register a contact, organization, deal, or activity in CRM Lite from natural language. Translate the request into safe POSTs against the existing endpoints, deduplicate via /api/search, validate stages belong to their pipeline, and report a functional summary. Do not expose internal endpoints, paths, or scripts unless the user asks for technical detail.
---

# CRM Data Entry

This skill is for the agent, not for the end user.

Use it when the user wants to load contacts, organizations, deals, or activities into CRM Lite from natural language ("agrega a Pedro de Acme", "crea un deal de 5M con Acme", "agendá una llamada con Maria mañana").

## Source of Truth

Read the app `AGENTS.md` before using this skill. That file defines the visible product capabilities, internal tools, communication rules, and limits of CRM Lite. If this skill and `AGENTS.md` appear to conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"CRM Lite registra contactos, empresas, deals y actividades a partir de lo que tú me cuentas, sin pedirte planillas ni formularios."

Valid user-facing wording:

- "Voy a crear el contacto Maria asociada a Acme."
- "Agrego un deal de CLP 5.000.000 en stage Propuesta del pipeline Ventas."
- "Agendé una llamada para mañana asociada a ese deal."

Avoid user-facing wording like:

- "Voy a hacer un POST a `/api/deals`."
- "Llamé al endpoint `/api/contacts`."
- "Ejecuté el script `import_contacts.py`."

Only mention those details if the user explicitly asks how the data entry works internally.

## Internal Workflow

1. **Classify the request.** Decide which entity the user is creating or updating: contact, organization, deal, activity, or a chain (e.g. "Pedro de Acme con un deal de 5M" creates contact + organization + deal + link).

2. **Deduplicate before creating.**
   - For organizations: query `GET /api/search?q=<name>` and check the `organizations` array. Confirm with the user before creating a duplicate name.
   - For contacts: search by first/last name and email. If the user provided an email, also list contacts with that email; collisions are blocked at the DB level.
   - For deals: search by title and ask the user when a similar title already exists.

3. **Resolve referenced entities.**
   - When the user mentions an organization, check that it exists. If not, ask whether to create it before continuing.
   - When the user mentions a contact, same rule. If a contact name is ambiguous, list candidates and ask.
   - When the user mentions a stage that does not exist in the pipeline, list available stages from `GET /api/pipelines` and ask.

4. **Build the payload.** Use the schema:
   - `POST /api/organizations` for empresas
   - `POST /api/contacts` for contactos
   - `POST /api/organizations/{id}/contacts` to link an existing contact to an organization (idempotent: re-posting updates the role and primary flag)
   - `POST /api/deals` for deals (must include `pipeline_id`, `stage_id`, `currency`, `amount_cents`)
   - `POST /api/activities` for actividades (must include at least one of `deal_id`, `contact_id`, `organization_id`)

5. **Honor amounts and currencies.**
   - Accept "5M", "5.000.000", "5 millones" → convert to `amount_cents = 500000000`.
   - Default currency is `CLP` only when the user explicitly leaves currency unspecified and CRM Lite has CLP as the only currency in the value registry. Otherwise ask.
   - When the user types a new currency code, send it as-is; the registry will record it for future autocomplete.

6. **Honor due dates.**
   - "mañana" → tomorrow at the user's typical working hour (or 09:00 if unknown).
   - "la próxima semana" → ask for a specific day if the user has not provided one.
   - Always send ISO 8601 strings; the backend normalizes them to naive UTC.

7. **Report back.**
   - State what was created or linked, in functional language.
   - Include the deal stage and amount when relevant.
   - If anything was skipped (duplicate, missing field), explain it.
   - Never expose endpoint URLs unless the user asked.

## Boundaries

- This skill writes to the local database only. It does not send emails, SMS, or any external message.
- This skill never deletes data.
- This skill never reopens a closed (won/lost) deal without explicit user confirmation.
- This skill does not bypass duplicate or validation rules: if the backend returns 400 / 409 for a stage-mismatch, name conflict, or empty required field, surface the failure functionally and ask the user how to proceed.
