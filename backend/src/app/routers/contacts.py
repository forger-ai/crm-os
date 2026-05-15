from __future__ import annotations

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
    ContactPatch,
    ContactRead,
    ContactSummary,
    ContactWrite,
    CustomFieldValueRead,
    DealSummary,
)
from app.services.field_values import record_values

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _record_contact_field_values(session: Session, payload: dict) -> None:
    record_values(
        session,
        {
            "contact.job_title": payload.get("job_title"),
            "contact.owner": payload.get("owner"),
        },
    )


def _organizations_of_contact(
    session: Session, contact_id: str
) -> list[ContactOrganizationLink]:
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


def _open_deals_of_contact(session: Session, contact_id: str) -> list[DealSummary]:
    rows = session.exec(
        select(Deal, PipelineStage)
        .join(PipelineStage, PipelineStage.id == Deal.stage_id)
        .where(Deal.primary_contact_id == contact_id, Deal.status == "open")
        .order_by(Deal.updated_at.desc())  # type: ignore[attr-defined]
    ).all()
    summaries: list[DealSummary] = []
    for deal, stage in rows:
        org_name = None
        if deal.organization_id is not None:
            org = session.get(Organization, deal.organization_id)
            if org is not None:
                org_name = org.name
        summaries.append(
            DealSummary(
                id=deal.id,
                title=deal.title,
                pipeline_id=deal.pipeline_id,
                stage_id=deal.stage_id,
                stage_name=stage.name,
                organization_id=deal.organization_id,
                organization_name=org_name,
                primary_contact_id=deal.primary_contact_id,
                primary_contact_name=None,
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


def _contact_custom_values(
    session: Session, contact_id: str
) -> list[CustomFieldValueRead]:
    rows = session.exec(
        select(CustomFieldDef, CustomFieldValue)
        .join(CustomFieldValue, CustomFieldValue.field_id == CustomFieldDef.id)
        .where(
            CustomFieldDef.entity == "contact",
            CustomFieldValue.entity_id == contact_id,
        )
        .order_by(CustomFieldDef.position)  # type: ignore[attr-defined]
    ).all()
    out: list[CustomFieldValueRead] = []
    for definition, value in rows:
        if definition.type in ("text", "select"):
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


def _read_contact(session: Session, contact: Contact) -> ContactRead:
    return ContactRead(
        id=contact.id,
        first_name=contact.first_name,
        last_name=contact.last_name,
        email=contact.email,
        phone=contact.phone,
        job_title=contact.job_title,
        owner=contact.owner,
        description=contact.description,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
        organizations=_organizations_of_contact(session, contact.id),
        open_deals=_open_deals_of_contact(session, contact.id),
        custom_fields=_contact_custom_values(session, contact.id),
    )


@router.get("", response_model=list[ContactSummary])
def list_contacts(
    q: str | None = Query(default=None),
    organization_id: str | None = Query(default=None),
    owner: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[ContactSummary]:
    stmt = select(Contact)
    if organization_id:
        stmt = stmt.join(
            ContactOrganization,
            ContactOrganization.contact_id == Contact.id,
        ).where(ContactOrganization.organization_id == organization_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            (func.lower(Contact.first_name).like(like))
            | (func.lower(func.coalesce(Contact.last_name, "")).like(like))
            | (func.lower(func.coalesce(Contact.email, "")).like(like))
        )
    if owner:
        stmt = stmt.where(Contact.owner == owner)
    stmt = stmt.order_by(Contact.first_name).offset((page - 1) * page_size).limit(page_size)  # type: ignore[attr-defined]

    contacts = list(session.exec(stmt).all())
    return [
        ContactSummary(
            id=contact.id,
            first_name=contact.first_name,
            last_name=contact.last_name,
            email=contact.email,
            job_title=contact.job_title,
            owner=contact.owner,
            organizations=_organizations_of_contact(session, contact.id),
        )
        for contact in contacts
    ]


@router.post("", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
def create_contact(
    payload: ContactWrite, session: Session = Depends(get_session)
) -> ContactRead:
    contact = Contact(**payload.model_dump())
    session.add(contact)
    _record_contact_field_values(session, payload.model_dump())
    session.commit()
    session.refresh(contact)
    return _read_contact(session, contact)


@router.get("/{contact_id}", response_model=ContactRead)
def get_contact(contact_id: str, session: Session = Depends(get_session)) -> ContactRead:
    contact = session.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return _read_contact(session, contact)


@router.patch("/{contact_id}", response_model=ContactRead)
def patch_contact(
    contact_id: str,
    payload: ContactPatch,
    session: Session = Depends(get_session),
) -> ContactRead:
    contact = session.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(contact, key, value)
    contact.updated_at = utcnow()
    session.add(contact)
    _record_contact_field_values(session, data)
    session.commit()
    session.refresh(contact)
    return _read_contact(session, contact)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: str, session: Session = Depends(get_session)
) -> None:
    contact = session.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    open_deal = session.exec(
        select(Deal)
        .where(Deal.primary_contact_id == contact_id, Deal.status == "open")
        .limit(1)
    ).first()
    if open_deal is not None:
        raise HTTPException(
            status_code=409,
            detail="Contact is the primary contact of an open deal; reassign first",
        )

    session.exec(
        ContactOrganization.__table__.delete().where(  # type: ignore[attr-defined]
            ContactOrganization.contact_id == contact_id
        )
    )
    session.exec(Note.__table__.delete().where(Note.contact_id == contact_id))  # type: ignore[attr-defined]
    session.exec(Activity.__table__.delete().where(Activity.contact_id == contact_id))  # type: ignore[attr-defined]
    session.delete(contact)
    session.commit()
