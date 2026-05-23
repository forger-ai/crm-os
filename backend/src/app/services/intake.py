"""Lead intake service: Gmail polling config, ingestion, and promotion.

The frontend polls Gmail every few minutes while the app is open and the
agent (running in Forger Desktop with the Gmail tool) reports detected leads
to `POST /api/intake/scan-result`. The backend never reaches Gmail itself.

Design notes:

- `IntakeConfig` is a single row. `get_config` creates it on first read.
- `last_polled_at` is the cursor. `since_iso` exposes it minus a small overlap
  so a message arriving right on a poll boundary is not missed; the
  (provider, message_id) idempotency absorbs the resulting re-reports.
- Ingestion is idempotent per Gmail message-id. A lead whose sender already
  matches a CRM contact is skipped — that is activity on a known contact, not
  a new lead (the `crm-email-sync` flow handles those).
- Promotion turns a lead into Organization (when known) + Contact + Deal in
  the default pipeline's first stage, plus a seed email Activity so the
  original message stays in the deal timeline.
"""

from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, func, select

from app.models import (
    Activity,
    Contact,
    ContactOrganization,
    Deal,
    IncomingLead,
    IntakeConfig,
    Organization,
    Pipeline,
    PipelineStage,
    utcnow,
)
from app.schemas import (
    IncomingLeadRead,
    IntakeConfigRead,
    IntakeConfigUpdate,
    LeadAccept,
    ScanResult,
    ScanResultSummary,
)

# A message landing right on a poll boundary could be timestamped just before
# the cursor; re-scanning a short overlap and relying on message-id dedup is
# cheaper than missing it.
_OVERLAP = timedelta(minutes=10)
# How far back the very first poll looks when there is no cursor yet.
_FIRST_RUN_LOOKBACK = timedelta(days=7)

_CONFIG_ID = "default"


# ── Config ──────────────────────────────────────────────────────────────────


def get_config(session: Session) -> IntakeConfig:
    """Return the single config row, creating it with defaults on first read."""
    config = session.get(IntakeConfig, _CONFIG_ID)
    if config is None:
        config = IntakeConfig(id=_CONFIG_ID)
        session.add(config)
        session.commit()
        session.refresh(config)
    return config


def _since(config: IntakeConfig):
    if config.last_polled_at is not None:
        return config.last_polled_at - _OVERLAP
    return utcnow() - _FIRST_RUN_LOOKBACK


def _pending_count(session: Session) -> int:
    return int(
        session.exec(
            select(func.count())
            .select_from(IncomingLead)
            .where(IncomingLead.status == "pending")
        ).first()
        or 0
    )


def config_read(session: Session) -> IntakeConfigRead:
    config = get_config(session)
    return IntakeConfigRead(
        enabled=config.enabled,
        mode=config.mode,  # type: ignore[arg-type]
        poll_interval_minutes=config.poll_interval_minutes,
        last_polled_at=config.last_polled_at,
        since_iso=_since(config),
        pending_count=_pending_count(session),
    )


def update_config(
    session: Session, payload: IntakeConfigUpdate
) -> IntakeConfigRead:
    config = get_config(session)
    data = payload.model_dump(exclude_unset=True)
    if "enabled" in data and data["enabled"] is not None:
        config.enabled = data["enabled"]
    if "mode" in data and data["mode"] is not None:
        config.mode = data["mode"]
    if (
        "poll_interval_minutes" in data
        and data["poll_interval_minutes"] is not None
    ):
        config.poll_interval_minutes = data["poll_interval_minutes"]
    config.updated_at = utcnow()
    session.add(config)
    session.commit()
    return config_read(session)


# ── Ingestion ───────────────────────────────────────────────────────────────


def _contact_by_email(session: Session, email: str | None) -> Contact | None:
    if not email or not email.strip():
        return None
    return session.exec(
        select(Contact).where(func.lower(Contact.email) == email.strip().lower())
    ).first()


def ingest_scan_result(
    session: Session, payload: ScanResult
) -> ScanResultSummary:
    """Store the leads from one poll and advance the cursor.

    In `auto` mode each new lead is promoted immediately; in `review` mode it
    stays pending for the user to confirm.
    """
    config = get_config(session)
    created = 0
    duplicates = 0
    skipped_known = 0
    promoted = 0

    for candidate in payload.leads:
        existing = session.exec(
            select(IncomingLead).where(
                IncomingLead.external_provider == "gmail",
                IncomingLead.external_message_id == candidate.external_message_id,
            )
        ).first()
        if existing is not None:
            duplicates += 1
            continue

        if _contact_by_email(session, candidate.from_email) is not None:
            skipped_known += 1
            continue

        lead = IncomingLead(
            external_provider="gmail",
            external_message_id=candidate.external_message_id,
            external_thread_id=candidate.external_thread_id,
            from_email=candidate.from_email,
            from_name=candidate.from_name,
            subject=candidate.subject,
            body=candidate.body,
            received_at=candidate.received_at,
            confidence=candidate.confidence,
            reason=candidate.reason,
            suggested_first_name=candidate.suggested_first_name,
            suggested_last_name=candidate.suggested_last_name,
            suggested_org_name=candidate.suggested_org_name,
            suggested_phone=candidate.suggested_phone,
        )
        session.add(lead)
        session.flush()
        created += 1

        if config.mode == "auto":
            _promote(session, lead, overrides=None)
            promoted += 1

    # Advance the cursor only forward.
    if config.last_polled_at is None or payload.polled_at > config.last_polled_at:
        config.last_polled_at = payload.polled_at
        config.updated_at = utcnow()
        session.add(config)

    session.commit()
    return ScanResultSummary(
        created=created,
        duplicates=duplicates,
        skipped_known=skipped_known,
        promoted=promoted,
    )


# ── Promotion ───────────────────────────────────────────────────────────────


def _split_name(full: str | None) -> tuple[str | None, str | None]:
    if not full or not full.strip():
        return None, None
    parts = full.strip().split()
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def _resolve_names(
    lead: IncomingLead, overrides: LeadAccept | None
) -> tuple[str, str | None]:
    first = (overrides.first_name if overrides else None) or lead.suggested_first_name
    last = (overrides.last_name if overrides else None) or lead.suggested_last_name
    if not first:
        parsed_first, parsed_last = _split_name(lead.from_name)
        first = first or parsed_first
        last = last or parsed_last
    if not first and lead.from_email and "@" in lead.from_email:
        first = lead.from_email.split("@")[0]
    return (first or "Lead")[:120], (last[:120] if last else None)


def _resolve_org(
    session: Session, lead: IncomingLead, overrides: LeadAccept | None
) -> Organization | None:
    override_name = overrides.organization_name if overrides else None
    name = override_name or lead.suggested_org_name
    if not name or not name.strip():
        return None
    name = name.strip()[:200]
    existing = session.exec(
        select(Organization).where(func.lower(Organization.name) == name.lower())
    ).first()
    if existing is not None:
        return existing
    domain = None
    if lead.from_email and "@" in lead.from_email:
        domain = lead.from_email.split("@")[-1][:200]
    org = Organization(name=name, domain=domain)
    session.add(org)
    session.flush()
    return org


def _default_first_stage(session: Session) -> tuple[Pipeline, PipelineStage]:
    pipeline = session.exec(
        select(Pipeline).where(Pipeline.is_default == True)  # noqa: E712
    ).first()
    if pipeline is None:
        pipeline = session.exec(select(Pipeline).order_by(Pipeline.position)).first()  # type: ignore[attr-defined]
    if pipeline is None:
        raise ValueError("No hay un pipeline configurado para crear el deal")
    stage = session.exec(
        select(PipelineStage)
        .where(PipelineStage.pipeline_id == pipeline.id)
        .order_by(PipelineStage.position)  # type: ignore[attr-defined]
    ).first()
    if stage is None:
        raise ValueError("El pipeline no tiene stages configurados")
    return pipeline, stage


def _promote(
    session: Session, lead: IncomingLead, overrides: LeadAccept | None
) -> IncomingLead:
    """Create Organization (when known) + Contact + Deal + seed Activity."""
    first_name, last_name = _resolve_names(lead, overrides)
    email = (overrides.email if overrides else None) or lead.from_email
    phone = (overrides.phone if overrides else None) or lead.suggested_phone
    org = _resolve_org(session, lead, overrides)

    contact = Contact(
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
    )
    session.add(contact)
    session.flush()

    if org is not None:
        session.add(
            ContactOrganization(
                contact_id=contact.id,
                organization_id=org.id,
                is_primary=True,
            )
        )

    pipeline, stage = _default_first_stage(session)
    display = org.name if org is not None else (
        f"{first_name} {last_name}".strip() if last_name else first_name
    )
    deal = Deal(
        title=f"Lead: {display}"[:200],
        organization_id=org.id if org is not None else None,
        primary_contact_id=contact.id,
        pipeline_id=pipeline.id,
        stage_id=stage.id,
        probability=stage.probability_default,
        amount_cents=0,
        currency="CLP",
        status="open",
    )
    session.add(deal)
    session.flush()

    # Keep the original email in the deal timeline. Skip if the crm-email-sync
    # flow already logged this exact message as an Activity.
    already_logged = session.exec(
        select(Activity).where(
            Activity.external_provider == lead.external_provider,
            Activity.external_message_id == lead.external_message_id,
        )
    ).first()
    if already_logged is None:
        subject = (lead.subject or "").strip()[:200] or "Correo de lead entrante"
        session.add(
            Activity(
                kind="email",
                subject=subject,
                body=lead.body,
                completed_at=lead.received_at or utcnow(),
                deal_id=deal.id,
                contact_id=contact.id,
                organization_id=org.id if org is not None else None,
                external_provider=lead.external_provider,
                external_message_id=lead.external_message_id,
                external_thread_id=lead.external_thread_id,
                from_email=lead.from_email,
                pending_send=False,
            )
        )

    lead.status = "accepted"
    lead.created_contact_id = contact.id
    lead.created_deal_id = deal.id
    lead.updated_at = utcnow()
    session.add(lead)
    return lead


# ── Review-queue actions ────────────────────────────────────────────────────


def list_leads(session: Session, status: str | None) -> list[IncomingLead]:
    stmt = select(IncomingLead)
    if status:
        stmt = stmt.where(IncomingLead.status == status)
    stmt = stmt.order_by(IncomingLead.created_at.desc())  # type: ignore[attr-defined]
    return list(session.exec(stmt).all())


def accept_lead(
    session: Session, lead: IncomingLead, overrides: LeadAccept
) -> IncomingLead:
    if lead.status != "pending":
        raise ValueError(f"El lead ya fue {lead.status}")
    _promote(session, lead, overrides)
    session.commit()
    session.refresh(lead)
    return lead


def dismiss_lead(session: Session, lead: IncomingLead) -> IncomingLead:
    if lead.status == "accepted":
        raise ValueError("El lead ya fue aceptado")
    lead.status = "dismissed"
    lead.updated_at = utcnow()
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


# ── Serialization ───────────────────────────────────────────────────────────


def lead_read(lead: IncomingLead) -> IncomingLeadRead:
    return IncomingLeadRead(
        id=lead.id,
        external_provider=lead.external_provider,
        external_message_id=lead.external_message_id,
        external_thread_id=lead.external_thread_id,
        from_email=lead.from_email,
        from_name=lead.from_name,
        subject=lead.subject,
        body=lead.body,
        received_at=lead.received_at,
        confidence=lead.confidence,
        reason=lead.reason,
        suggested_first_name=lead.suggested_first_name,
        suggested_last_name=lead.suggested_last_name,
        suggested_org_name=lead.suggested_org_name,
        suggested_phone=lead.suggested_phone,
        status=lead.status,  # type: ignore[arg-type]
        created_contact_id=lead.created_contact_id,
        created_deal_id=lead.created_deal_id,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )
