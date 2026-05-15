---
name: quote-builder
description: Use when the user asks CRM OS to build a quote from natural language, edit an existing draft quote, or mark a quote as sent/accepted/rejected. The skill translates the user's intent into POSTs against /api/quotes and /api/quotes/{id}/lines, pulling product defaults from the catalog where appropriate. Never sends the quote anywhere external by itself.
---

# Quote Builder

This skill is for the agent, not for the end user.

Use it when the user says things like:

- "armame una cotización para el deal de Acme con 3 licencias Pro"
- "agrega una línea de servicio de implementación a la cotización Q-2026-007"
- "marca como enviada la cotización de Acme"
- "el cliente aceptó la cotización Q-2026-005"

## Source of Truth

Read the app `AGENTS.md` before using this skill. If this skill and `AGENTS.md` appear to conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"CRM OS arma cotizaciones por deal con productos del catálogo o líneas libres, calcula subtotal, impuesto y total automáticamente, y registra el ciclo enviada → aceptada/rechazada."

Avoid wording like:

- "Voy a hacer un POST a `/api/quotes`."
- "Estoy llamando al endpoint de líneas."

## Internal Workflow

### Building a new quote

1. **Identify the deal.** If the user gives a deal title, look it up via `GET /api/search?q=<title>`. Confirm with the user if multiple match. If no deal exists, ask before creating one (use `crm-data-entry`).

2. **Identify the products.** For each line the user mentions:
   - Search the catalog: `GET /api/products?q=<name or sku>`.
   - If exactly one match, use its id. The backend will pull `default_unit_price_cents` automatically if you pass `unit_price_cents=0` along with `product_id`.
   - If multiple candidates or none, ask the user which product or whether to create a free line (no `product_id`, the user names it).
   - Never create a new product unless the user explicitly asks. Free lines are fine for one-off items.

3. **Resolve currency.** Default to the deal's currency. If the user specifies a different one, use it. The line price stays as the number in the catalog or what the user dictates — no auto-conversion between currencies.

4. **Build the payload** for `POST /api/quotes`:
   ```json
   {
     "deal_id": "...",
     "title": "Propuesta v1 — Acme Q2",
     "currency": "CLP",
     "tax_rate": 19,
     "valid_until": "2026-06-30T23:59:59Z",
     "lines": [
       {"product_id": "...", "name": "Licencia Pro", "quantity": 3, "unit_price_cents": 9990000, "discount_pct": 0},
       {"name": "Implementación", "quantity": 1, "unit_price_cents": 500000, "discount_pct": 10}
     ]
   }
   ```
   The backend recomputes subtotal, tax, and total. Trust those numbers in your summary back to the user.

5. **Report back.** Use the response: "Creé la cotización Q-2026-005 por CLP 32.385.500 (subtotal 27.227.310 + IVA 19%). Tiene 2 líneas." Mention the title, number, total per currency, and the line count.

### Editing a draft quote

Only **draft** quotes are editable. If the quote is `sent` / `accepted` / `rejected` / `expired`, tell the user and offer to create a revision (a new draft quote) instead of modifying.

- Add line: `POST /api/quotes/{id}/lines` with the same payload shape as a single line.
- Update line: `PATCH /api/quotes/{id}/lines/{line_id}` with the changing fields.
- Delete line: `DELETE /api/quotes/{id}/lines/{line_id}` — positions auto-resequence.
- Update title/tax_rate/currency/valid_until/notes: `PATCH /api/quotes/{id}`.

After every mutation the backend recomputes totals; surface the new total to the user.

### Status transitions

The user-visible verbs and their endpoints:

- "marca como enviada": `POST /api/quotes/{id}/send` (draft → sent). Stamps `sent_at`.
- "el cliente aceptó": `POST /api/quotes/{id}/accept` (sent → accepted). Stamps `decided_at`. **Does not** auto-win the deal.
- "el cliente rechazó": `POST /api/quotes/{id}/reject` (sent → rejected). Stamps `decided_at`.

If the user says "ganamos el deal" after accepting a quote, offer to move the deal: "¿quieres que también mueva el deal a Cerrado Ganado?" before calling `/api/deals/{id}/win`.

`expired` is set lazily by the backend when a quote with `valid_until < now` is read. If the user asks to re-activate an expired quote, the only path is to clone it as a new draft (re-create with the same lines and a new `valid_until`).

## Boundaries

- This skill never emails or prints the quote. Sending the proposal is on the user.
- This skill never auto-creates products. Free lines are fine for one-off items.
- This skill never converts currencies. The product default price is copied as-is into the quote currency; the user adjusts if needed.
- This skill never changes the deal state when accepting a quote — always asks first.
- This skill never modifies a non-draft quote. Sent quotes are part of the audit trail.
- Numbers are managed by the backend (`Q-YYYY-NNN`). Do not propose custom numbers.
