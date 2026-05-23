# CRM OS

CRM OS is now installed in your private Forger space. Its database lives on your machine and the app opens as its own experience. It is the successor to CRM Lite — it keeps every CRM Lite feature and adds a product catalog, quotes with line items, and local heuristic lead scoring.

## Getting started

1. Open the app from Forger Desktop.
2. You will see a default `Ventas` pipeline with standard stages (Lead → Calificado → Propuesta → Negociacion → Cerrado Ganado → Cerrado Perdido). You can rename, reorder, or replace it from Settings.
3. Create your first contact or organization from the "Nuevo" button on each list, or import a CSV from Settings → Importar CSV (always with a dry-run preview before applying).
4. Create a deal and drag it across the pipeline columns to move the flow forward.
5. Load your products in the Productos tab (SKU, price, currency, category). Then build quotes for a deal from its Cotizaciones tab.
6. To start logging your emails, connect Gmail from the Tools view in Forger Desktop. Then ask the agent "sincroniza mis emails" and CRM OS will record messages exchanged with your contacts as activities.
7. Check the Dashboard for the Hot leads and Cold deals lists, computed from each deal's real behavior.

## What the agent can do

- Register contacts, organizations, deals, and activities from natural language.
- Summarize a single deal or the whole week.
- Draft a follow-up email based on the real deal history.
- Spot stalled deals and suggest a concrete next step.
- Sync your Gmail messages as activities, filtered to senders and recipients that match an existing contact.
- Send follow-up emails from a deal or contact through your connected Gmail account.
- Build quotes from natural language ("a quote for Acme with 3 Pro licenses"), add lines, transition to sent/accepted/rejected.
- Explain why a deal is hot, warm, or cold — and what to do about it.

Your data stays on your machine. Nothing is sent outside unless you decide to do so. The Gmail connection lives in Forger Desktop, not inside CRM OS — the app never stores your password or your refresh token.
