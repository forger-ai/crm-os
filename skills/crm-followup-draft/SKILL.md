---
name: crm-followup-draft
description: Use when the user asks to draft a follow-up email or message for a contact or deal in CRM Lite. Build the draft from the actual deal context (stage history, recent activities, notes). Return the draft text only; never send the message and never log it as completed without user confirmation.
---

# CRM Follow-up Draft

This skill is for the agent, not for the end user.

Use it when the user says "redactame un follow-up para X", "armame un correo para retomar contacto con Maria", "pasame un borrador para cerrar el deal de Acme".

## Source of Truth

Read the app `AGENTS.md` before using this skill. CRM Lite does not send any external message; this skill produces text only. If this skill and `AGENTS.md` conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"CRM Lite te puede preparar un borrador de correo o mensaje basado en el historial del deal. Tú lo revisas y lo envías por tu cuenta."

Avoid wording like:

- "Mandé el correo."
- "Programé el envío."
- "Llamé al endpoint de email."

## Internal Workflow

1. **Identify the target.** A follow-up is anchored on a deal or a contact. Use the same disambiguation flow as `crm-deal-summary` (search by title or name, ask if ambiguous).

2. **Pull context.**
   - Deal-anchored draft: `GET /api/deals/{id}`. Use the title, monto+currency, stage, expected close date, last stage history entry, last 3 activities (sorted by date desc), and last pinned note.
   - Contact-anchored draft: `GET /api/contacts/{id}` for empresa, cargo, owner. Then `GET /api/notes?contact_id=<id>` and `GET /api/activities?contact_id=<id>` for recent context.
   - Organization-anchored draft: `GET /api/organizations/{id}` for industria, deals abiertos, contactos.

3. **Decide tone and intent.**
   - If the deal is in early stages (Lead, Calificado): tone is curious and exploratory.
   - If in Propuesta or Negociacion: tone is concrete, references the proposal.
   - If in Cerrado Ganado: tone is gracias + onboarding next steps.
   - If in Cerrado Perdido: tone is honest + abierto a futuro contacto. Always mention the lost reason when there is one, framed politely.
   - If the most recent activity is a vencida (overdue), acknowledge the gap explicitly.

4. **Build the draft.**
   - Greeting in the language matching the contact data (default Spanish for CRM Lite).
   - One sentence anchoring the conversation: reference last activity / last note / current stage.
   - One sentence on the value proposition or the open question.
   - One concrete next step ("¿podemos hablar el martes a las 11?", "¿te llega el resumen comercial actualizado por correo?").
   - Closing with the owner's name from the deal or contact (`deal.owner` or `contact.owner`).

5. **Return only the draft text** wrapped in clear delimiters. The user will copy and send manually. Optionally append a one-line note in your own voice about what assumptions you used so the user can correct them.

## Boundaries

- Do not send the email or any external message. CRM Lite has no SMTP configuration.
- Do not log the draft as a completed activity. If the user later confirms the email was sent, that's their cue to log it; you can offer to call `POST /api/activities` with `kind=email` and `completed_at` set, asking before doing so.
- Do not invent commitments, prices, or technical details that do not appear in the deal context.
- If you have no recent context (no activities, no notes), tell the user so and ask what they want to anchor the message on.
