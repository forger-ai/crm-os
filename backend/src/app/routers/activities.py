from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import Activity, Contact, Deal, Organization, utcnow
from app.schemas import (
    ActivityExternalImport,
    ActivityKind,
    ActivityPatch,
    ActivityRead,
    ActivityWrite,
)
from app.services.email_sync import import_external_email
from app.services.field_values import record_values

router = APIRouter(prefix="/api/activities", tags=["activities"])


def _validate_anchor(
    session: Session,
    deal_id: str | None,
    contact_id: str | None,
    organization_id: str | None,
) -> None:
    if not any((deal_id, contact_id, organization_id)):
        raise ValueError("Activity must reference at least one of deal, contact, or organization")
    if deal_id and session.get(Deal, deal_id) is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    if contact_id and session.get(Contact, contact_id) is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    if organization_id and session.get(Organization, organization_id) is None:
        raise HTTPException(status_code=404, detail="Organization not found")


def _read(activity: Activity) -> ActivityRead:
    return ActivityRead(
        id=activity.id,
        kind=activity.kind,  # type: ignore[arg-type]
        subject=activity.subject,
        body=activity.body,
        due_at=activity.due_at,
        completed_at=activity.completed_at,
        deal_id=activity.deal_id,
        contact_id=activity.contact_id,
        organization_id=activity.organization_id,
        owner=activity.owner,
        external_provider=activity.external_provider,
        external_message_id=activity.external_message_id,
        external_thread_id=activity.external_thread_id,
        from_email=activity.from_email,
        to_email=activity.to_email,
        pending_send=activity.pending_send,
        created_at=activity.created_at,
        updated_at=activity.updated_at,
    )


@router.get("", response_model=list[ActivityRead])
def list_activities(
    kind: ActivityKind | None = Query(default=None),
    completed: bool | None = Query(default=None),
    due_from: datetime | None = Query(default=None),
    due_to: datetime | None = Query(default=None),
    deal_id: str | None = Query(default=None),
    contact_id: str | None = Query(default=None),
    organization_id: str | None = Query(default=None),
    owner: str | None = Query(default=None),
    pending_send: bool | None = Query(default=None),
    external_provider: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[ActivityRead]:
    stmt = select(Activity)
    if kind:
        stmt = stmt.where(Activity.kind == kind)
    if completed is True:
        stmt = stmt.where(Activity.completed_at.is_not(None))  # type: ignore[union-attr]
    if completed is False:
        stmt = stmt.where(Activity.completed_at.is_(None))  # type: ignore[union-attr]
    if due_from:
        stmt = stmt.where(Activity.due_at >= due_from)
    if due_to:
        stmt = stmt.where(Activity.due_at <= due_to)
    if deal_id:
        stmt = stmt.where(Activity.deal_id == deal_id)
    if contact_id:
        stmt = stmt.where(Activity.contact_id == contact_id)
    if organization_id:
        stmt = stmt.where(Activity.organization_id == organization_id)
    if owner:
        stmt = stmt.where(Activity.owner == owner)
    if pending_send is not None:
        stmt = stmt.where(Activity.pending_send == pending_send)
    if external_provider:
        stmt = stmt.where(Activity.external_provider == external_provider)
    stmt = (
        stmt.order_by(Activity.due_at.is_(None), Activity.due_at, Activity.created_at.desc())  # type: ignore[attr-defined]
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(session.exec(stmt).all())
    return [_read(a) for a in rows]


@router.post("", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: ActivityWrite, session: Session = Depends(get_session)
) -> ActivityRead:
    _validate_anchor(session, payload.deal_id, payload.contact_id, payload.organization_id)
    activity = Activity(**payload.model_dump())
    session.add(activity)
    record_values(session, {"activity.owner": payload.owner})
    session.commit()
    session.refresh(activity)
    return _read(activity)


@router.get("/{activity_id}", response_model=ActivityRead)
def get_activity(
    activity_id: str, session: Session = Depends(get_session)
) -> ActivityRead:
    activity = session.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return _read(activity)


@router.patch("/{activity_id}", response_model=ActivityRead)
def patch_activity(
    activity_id: str,
    payload: ActivityPatch,
    session: Session = Depends(get_session),
) -> ActivityRead:
    activity = session.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    data = payload.model_dump(exclude_unset=True)
    next_deal = data.get("deal_id", activity.deal_id)
    next_contact = data.get("contact_id", activity.contact_id)
    next_org = data.get("organization_id", activity.organization_id)
    _validate_anchor(session, next_deal, next_contact, next_org)
    for key, value in data.items():
        setattr(activity, key, value)
    activity.updated_at = utcnow()
    session.add(activity)
    record_values(session, {"activity.owner": data.get("owner")})
    session.commit()
    session.refresh(activity)
    return _read(activity)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: str, session: Session = Depends(get_session)
) -> None:
    activity = session.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    session.delete(activity)
    session.commit()


@router.post("/{activity_id}/complete", response_model=ActivityRead)
def complete_activity(
    activity_id: str, session: Session = Depends(get_session)
) -> ActivityRead:
    activity = session.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    activity.completed_at = utcnow()
    activity.updated_at = utcnow()
    activity.pending_send = False
    session.add(activity)
    session.commit()
    session.refresh(activity)
    return _read(activity)


@router.post(
    "/import-external",
    response_model=ActivityRead,
    status_code=status.HTTP_200_OK,
)
def import_external(
    payload: ActivityExternalImport,
    session: Session = Depends(get_session),
) -> ActivityRead:
    """Idempotent ingestion of an external email (Gmail today).

    The agent (running with the Gmail official tool inside Forger Desktop)
    fetches messages and posts them here one by one. Re-importing the same
    message returns the existing record.
    """
    activity, created = import_external_email(session, payload)
    if created:
        session.commit()
        session.refresh(activity)
    return _read(activity)
