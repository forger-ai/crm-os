"""Email sync ingestion service.

The agent (running inside Forger Desktop with the Gmail official tool) calls
`POST /api/activities/import-external` for each Gmail message it wants logged
into CRM OS. This module handles the idempotency and contact resolution so
the route stays thin.

Design notes:

- Idempotent on the (external_provider, external_message_id) pair. Re-importing
  the same Gmail message is a no-op that returns the existing activity.
- Anchor resolution prefers explicit deal_id/contact_id/organization_id from
  the agent. If none are provided, we look up Contact rows whose email matches
  any value in match_by_emails. The first match wins; the activity is anchored
  to that contact and (when the contact has exactly one open deal) to that
  deal as well.
- v0.2 only imports kind=email. Calendar events ride a different ingestion
  path that does not exist yet.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, func, select

from app.models import Activity, Contact, Deal, utcnow
from app.schemas import ActivityExternalImport


def _resolve_contact_by_emails(
    session: Session, emails: list[str]
) -> Contact | None:
    cleaned = [email.strip().lower() for email in emails if email and email.strip()]
    if not cleaned:
        return None
    stmt = select(Contact).where(
        func.lower(Contact.email).in_(cleaned)  # type: ignore[arg-type]
    )
    return session.exec(stmt).first()


def _single_open_deal_for_contact(session: Session, contact_id: str) -> Deal | None:
    stmt = (
        select(Deal)
        .where(Deal.primary_contact_id == contact_id)
        .where(Deal.status == "open")
    )
    deals = list(session.exec(stmt).all())
    return deals[0] if len(deals) == 1 else None


def import_external_email(
    session: Session, payload: ActivityExternalImport
) -> tuple[Activity, bool]:
    """Idempotent import. Returns (activity, created)."""
    existing = session.exec(
        select(Activity)
        .where(Activity.external_provider == payload.external_provider)
        .where(Activity.external_message_id == payload.external_message_id)
    ).first()
    if existing is not None:
        return existing, False

    deal_id = payload.deal_id
    contact_id = payload.contact_id
    organization_id = payload.organization_id

    if not any((deal_id, contact_id, organization_id)) and payload.match_by_emails:
        match = _resolve_contact_by_emails(session, payload.match_by_emails)
        if match is not None:
            contact_id = match.id
            if not deal_id:
                inferred_deal = _single_open_deal_for_contact(session, match.id)
                if inferred_deal is not None:
                    deal_id = inferred_deal.id
                    organization_id = (
                        organization_id or inferred_deal.organization_id
                    )

    if not any((deal_id, contact_id, organization_id)):
        raise ValueError(
            "No anchor for email: provide deal_id, contact_id, organization_id, "
            "or match_by_emails matching an existing contact"
        )

    activity = Activity(
        kind="email",
        subject=payload.subject,
        body=payload.body,
        completed_at=payload.completed_at,
        owner=payload.owner,
        deal_id=deal_id,
        contact_id=contact_id,
        organization_id=organization_id,
        external_provider=payload.external_provider,
        external_message_id=payload.external_message_id,
        external_thread_id=payload.external_thread_id,
        from_email=payload.from_email,
        to_email=payload.to_email,
        pending_send=False,
    )
    session.add(activity)
    session.flush()
    return activity, True


def email_sync_status(session: Session, provider: str = "gmail") -> dict:
    """Aggregate counters for the Settings → Conexiones panel.

    All counts only include kind=email rows so call/meeting/task activities do
    not get reported as Gmail sync activity.
    """
    last = session.exec(
        select(func.max(Activity.created_at)).where(
            Activity.external_provider == provider,
            Activity.kind == "email",
        )
    ).first()

    total = session.exec(
        select(func.count())
        .select_from(Activity)
        .where(
            Activity.external_provider == provider,
            Activity.kind == "email",
        )
    ).first() or 0

    cutoff = utcnow() - timedelta(hours=24)
    last_24h = session.exec(
        select(func.count())
        .select_from(Activity)
        .where(
            Activity.external_provider == provider,
            Activity.kind == "email",
            Activity.created_at >= cutoff,
        )
    ).first() or 0

    pending = session.exec(
        select(func.count())
        .select_from(Activity)
        .where(
            Activity.kind == "email",
            Activity.pending_send.is_(True),  # type: ignore[union-attr]
        )
    ).first() or 0

    return {
        "provider": provider,
        "last_synced_at": last,
        "total_synced": int(total or 0),
        "last_24h": int(last_24h or 0),
        "pending_send_count": int(pending or 0),
    }


# Internal helper used by tests and callers that want a typed datetime back
# without round-tripping through SQLModel.
def latest_activity_created_at(session: Session, provider: str) -> datetime | None:
    return session.exec(
        select(func.max(Activity.created_at)).where(
            Activity.external_provider == provider,
            Activity.kind == "email",
        )
    ).first()
