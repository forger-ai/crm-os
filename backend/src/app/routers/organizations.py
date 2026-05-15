from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, func, select

from app.database import get_session
from app.models import (
    Activity,
    Contact,
    ContactOrganization,
    CustomFieldDef,
    CustomFieldValue,
    Deal,
    Note,
    Organization,
    PipelineStage,
    utcnow,
)
from app.schemas import (
    ContactOrganizationLink,
    ContactOrganizationLinkWrite,
    ContactSummary,
    CustomFieldValueRead,
    DealSummary,
    OrganizationPatch,
    OrganizationRead,
    OrganizationSummary,
    OrganizationWrite,
)
from app.services.field_values import record_values

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


def _record_org_field_values(session: Session, payload: dict) -> None:
    record_values(
        session,
        {
            "organization.industry": payload.get("industry"),
            "organization.owner": payload.get("owner"),
            "organization.address": payload.get("address"),
        },
    )


def _link_summary(session: Session, contact_id: str) -> list[ContactOrganizationLink]:
    rows = session.exec(
        select(ContactOrganization, Organization)
        .join(Organization, Organization.id == ContactOrganization.organization_id)
        .where(ContactOrganization.contact_id == contact_id)
    ).all()
    return [
        ContactOrganizationLink(
            organization_id=link.organization_id,
            organization_name=org.name,
            role=link.role,
            is_primary=link.is_primary,
        )
        for link, org in rows
    ]


def _organization_contacts(session: Session, org_id: str) -> list[ContactSummary]:
    rows = session.exec(
        select(ContactOrganization, Contact)
        .join(Contact, Contact.id == ContactOrganization.contact_id)
        .where(ContactOrganization.organization_id == org_id)
    ).all()
    summaries: list[ContactSummary] = []
    for _, contact in rows:
        summaries.append(
            ContactSummary(
                id=contact.id,
                first_name=contact.first_name,
                last_name=contact.last_name,
                email=contact.email,
                job_title=contact.job_title,
                owner=contact.owner,
                organizations=_link_summary(session, contact.id),
            )
        )
    return summaries


def _organization_open_deals(session: Session, org_id: str) -> list[DealSummary]:
    rows = session.exec(
        select(Deal, PipelineStage)
        .join(PipelineStage, PipelineStage.id == Deal.stage_id)
        .where(Deal.organization_id == org_id, Deal.status == "open")
        .order_by(Deal.updated_at.desc())  # type: ignore[attr-defined]
    ).all()

    summaries: list[DealSummary] = []
    for deal, stage in rows:
        contact_name = None
        if deal.primary_contact_id is not None:
            contact = session.get(Contact, deal.primary_contact_id)
            if contact is not None:
                contact_name = (
                    f"{contact.first_name} {contact.last_name or ''}".strip()
                )
        summaries.append(
            DealSummary(
                id=deal.id,
                title=deal.title,
                pipeline_id=deal.pipeline_id,
                stage_id=deal.stage_id,
                stage_name=stage.name,
                organization_id=deal.organization_id,
                organization_name=None,
                primary_contact_id=deal.primary_contact_id,
                primary_contact_name=contact_name,
                owner=deal.owner,
                amount_cents=deal.amount_cents,
                currency=deal.currency,
                probability=deal.probability,
                expected_close_date=deal.expected_close_date,
                status=deal.status,
                updated_at=deal.updated_at,
            )
        )
    return summaries


def _organization_custom_values(
    session: Session, org_id: str
) -> list[CustomFieldValueRead]:
    rows = session.exec(
        select(CustomFieldDef, CustomFieldValue)
        .join(CustomFieldValue, CustomFieldValue.field_id == CustomFieldDef.id)
        .where(
            CustomFieldDef.entity == "organization",
            CustomFieldValue.entity_id == org_id,
        )
        .order_by(CustomFieldDef.position)  # type: ignore[attr-defined]
    ).all()
    out: list[CustomFieldValueRead] = []
    for definition, value in rows:
        raw: object | None
        if definition.type == "text" or definition.type == "select":
            raw = value.value_text
        elif definition.type == "number":
            raw = value.value_number
        elif definition.type == "date":
            raw = value.value_date
        elif definition.type == "bool":
            raw = value.value_bool
        else:
            raw = None
        out.append(
            CustomFieldValueRead(
                field_id=definition.id,
                key=definition.key,
                label=definition.label,
                type=definition.type,
                value=raw,
            )
        )
    return out


def _read_organization(session: Session, org: Organization) -> OrganizationRead:
    return OrganizationRead(
        id=org.id,
        name=org.name,
        domain=org.domain,
        industry=org.industry,
        website=org.website,
        phone=org.phone,
        address=org.address,
        owner=org.owner,
        description=org.description,
        created_at=org.created_at,
        updated_at=org.updated_at,
        contacts=_organization_contacts(session, org.id),
        open_deals=_organization_open_deals(session, org.id),
        custom_fields=_organization_custom_values(session, org.id),
    )


@router.get("", response_model=list[OrganizationSummary])
def list_organizations(
    q: str | None = Query(default=None),
    owner: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[OrganizationSummary]:
    stmt = select(Organization)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            (func.lower(Organization.name).like(like))
            | (func.lower(func.coalesce(Organization.domain, "")).like(like))
        )
    if owner:
        stmt = stmt.where(Organization.owner == owner)
    stmt = stmt.order_by(Organization.name).offset((page - 1) * page_size).limit(page_size)  # type: ignore[attr-defined]
    orgs = list(session.exec(stmt).all())

    contacts_count: dict[str, int] = defaultdict(int)
    for row in session.exec(
        select(ContactOrganization.organization_id, func.count())
        .group_by(ContactOrganization.organization_id)
    ).all():
        org_id, count = row
        contacts_count[org_id] = count

    open_value: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    open_count: dict[str, int] = defaultdict(int)
    for row in session.exec(
        select(Deal.organization_id, Deal.currency, func.sum(Deal.amount_cents), func.count())
        .where(Deal.status == "open", Deal.organization_id.is_not(None))  # type: ignore[union-attr]
        .group_by(Deal.organization_id, Deal.currency)
    ).all():
        org_id, currency, total, count = row
        open_value[org_id][currency] = int(total or 0)
        open_count[org_id] += count

    return [
        OrganizationSummary(
            id=org.id,
            name=org.name,
            domain=org.domain,
            industry=org.industry,
            owner=org.owner,
            contacts_count=contacts_count.get(org.id, 0),
            open_deals_count=open_count.get(org.id, 0),
            open_deals_value=dict(open_value.get(org.id, {})),
        )
        for org in orgs
    ]


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationWrite,
    session: Session = Depends(get_session),
) -> OrganizationRead:
    org = Organization(**payload.model_dump())
    session.add(org)
    _record_org_field_values(session, payload.model_dump())
    session.commit()
    session.refresh(org)
    return _read_organization(session, org)


@router.get("/{org_id}", response_model=OrganizationRead)
def get_organization(org_id: str, session: Session = Depends(get_session)) -> OrganizationRead:
    org = session.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return _read_organization(session, org)


@router.patch("/{org_id}", response_model=OrganizationRead)
def patch_organization(
    org_id: str,
    payload: OrganizationPatch,
    session: Session = Depends(get_session),
) -> OrganizationRead:
    org = session.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(org, key, value)
    org.updated_at = utcnow()
    session.add(org)
    _record_org_field_values(session, data)
    session.commit()
    session.refresh(org)
    return _read_organization(session, org)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(org_id: str, session: Session = Depends(get_session)) -> None:
    org = session.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    open_deal = session.exec(
        select(Deal).where(Deal.organization_id == org_id, Deal.status == "open").limit(1)
    ).first()
    if open_deal is not None:
        raise HTTPException(
            status_code=409,
            detail="Organization has open deals; close or reassign them first",
        )

    # Cascade cleanup for adjacent records that don't have foreign-key cascade.
    session.exec(
        ContactOrganization.__table__.delete().where(  # type: ignore[attr-defined]
            ContactOrganization.organization_id == org_id
        )
    )
    session.exec(Note.__table__.delete().where(Note.organization_id == org_id))  # type: ignore[attr-defined]
    session.exec(Activity.__table__.delete().where(Activity.organization_id == org_id))  # type: ignore[attr-defined]
    session.delete(org)
    session.commit()


# ── Contact ↔ organization links ────────────────────────────────────────────


@router.post(
    "/{org_id}/contacts",
    status_code=status.HTTP_201_CREATED,
    response_model=ContactOrganizationLink,
)
def link_contact(
    org_id: str,
    payload: ContactOrganizationLinkWrite,
    session: Session = Depends(get_session),
) -> ContactOrganizationLink:
    org = session.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    contact = session.get(Contact, payload.contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    existing = session.exec(
        select(ContactOrganization).where(
            ContactOrganization.organization_id == org_id,
            ContactOrganization.contact_id == payload.contact_id,
        )
    ).first()
    if existing is not None:
        existing.role = payload.role
        existing.is_primary = payload.is_primary
        session.add(existing)
        record_values(session, {"contact_organization.role": payload.role})
        session.commit()
        return ContactOrganizationLink(
            organization_id=org_id,
            organization_name=org.name,
            role=existing.role,
            is_primary=existing.is_primary,
        )

    link = ContactOrganization(
        contact_id=payload.contact_id,
        organization_id=org_id,
        role=payload.role,
        is_primary=payload.is_primary,
    )
    session.add(link)
    record_values(session, {"contact_organization.role": payload.role})
    session.commit()
    return ContactOrganizationLink(
        organization_id=org_id,
        organization_name=org.name,
        role=link.role,
        is_primary=link.is_primary,
    )


@router.delete(
    "/{org_id}/contacts/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unlink_contact(
    org_id: str,
    contact_id: str,
    session: Session = Depends(get_session),
) -> None:
    link = session.exec(
        select(ContactOrganization).where(
            ContactOrganization.organization_id == org_id,
            ContactOrganization.contact_id == contact_id,
        )
    ).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    session.delete(link)
    session.commit()
