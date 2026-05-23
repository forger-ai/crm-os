from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, func, select

from app.database import get_session
from app.models import (
    Activity,
    Contact,
    CustomFieldDef,
    CustomFieldValue,
    Deal,
    DealStageHistory,
    Note,
    Organization,
    PipelineStage,
    to_naive_utc,
    utcnow,
)
from app.schemas import (
    ActivityRead,
    CustomFieldValueRead,
    DealLose,
    DealMove,
    DealPatch,
    DealRead,
    DealStageHistoryRead,
    DealStatus,
    DealSummary,
    DealWin,
    DealWrite,
    NoteRead,
)
from app.services.deals import (
    assert_stage_in_pipeline,
    first_stage_of_kind,
    get_stage_or_400,
    record_stage_change,
)
from app.services.field_values import record_values

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _record_deal_field_values(session: Session, payload: dict) -> None:
    record_values(
        session,
        {
            "deal.owner": payload.get("owner"),
            "deal.currency": payload.get("currency"),
            "deal.lost_reason": payload.get("lost_reason"),
        },
    )


def _stage_name(session: Session, stage_id: str | None) -> str | None:
    if stage_id is None:
        return None
    stage = session.get(PipelineStage, stage_id)
    return stage.name if stage is not None else None


def _contact_name(session: Session, contact_id: str | None) -> str | None:
    if contact_id is None:
        return None
    contact = session.get(Contact, contact_id)
    if contact is None:
        return None
    return f"{contact.first_name} {contact.last_name or ''}".strip()


def _organization_name(session: Session, org_id: str | None) -> str | None:
    if org_id is None:
        return None
    org = session.get(Organization, org_id)
    return org.name if org is not None else None


def _summary(session: Session, deal: Deal) -> DealSummary:
    return DealSummary(
        id=deal.id,
        title=deal.title,
        pipeline_id=deal.pipeline_id,
        stage_id=deal.stage_id,
        stage_name=_stage_name(session, deal.stage_id) or "",
        organization_id=deal.organization_id,
        organization_name=_organization_name(session, deal.organization_id),
        primary_contact_id=deal.primary_contact_id,
        primary_contact_name=_contact_name(session, deal.primary_contact_id),
        owner=deal.owner,
        amount_cents=deal.amount_cents,
        currency=deal.currency,
        probability=deal.probability,
        expected_close_date=deal.expected_close_date,
        status=deal.status,  # type: ignore[arg-type]
        updated_at=deal.updated_at,
    )


def _stage_history(session: Session, deal_id: str) -> list[DealStageHistoryRead]:
    rows = list(
        session.exec(
            select(DealStageHistory)
            .where(DealStageHistory.deal_id == deal_id)
            .order_by(DealStageHistory.changed_at)  # type: ignore[attr-defined]
        ).all()
    )
    return [
        DealStageHistoryRead(
            id=row.id,
            from_stage_id=row.from_stage_id,
            from_stage_name=_stage_name(session, row.from_stage_id),
            to_stage_id=row.to_stage_id,
            to_stage_name=_stage_name(session, row.to_stage_id) or "",
            note=row.note,
            changed_at=row.changed_at,
        )
        for row in rows
    ]


def _activities_of(session: Session, deal_id: str) -> list[ActivityRead]:
    rows = list(
        session.exec(
            select(Activity)
            .where(Activity.deal_id == deal_id)
            .order_by(Activity.due_at)  # type: ignore[attr-defined]
        ).all()
    )
    return [
        ActivityRead(
            id=a.id,
            kind=a.kind,  # type: ignore[arg-type]
            subject=a.subject,
            body=a.body,
            due_at=a.due_at,
            completed_at=a.completed_at,
            deal_id=a.deal_id,
            contact_id=a.contact_id,
            organization_id=a.organization_id,
            owner=a.owner,
            external_provider=a.external_provider,
            external_message_id=a.external_message_id,
            external_thread_id=a.external_thread_id,
            from_email=a.from_email,
            to_email=a.to_email,
            pending_send=a.pending_send,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in rows
    ]


def _notes_of(session: Session, deal_id: str) -> list[NoteRead]:
    rows = list(
        session.exec(
            select(Note)
            .where(Note.deal_id == deal_id)
            .order_by(Note.pinned.desc(), Note.created_at.desc())  # type: ignore[attr-defined]
        ).all()
    )
    return [
        NoteRead(
            id=n.id,
            body=n.body,
            deal_id=n.deal_id,
            contact_id=n.contact_id,
            organization_id=n.organization_id,
            author=n.author,
            pinned=n.pinned,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in rows
    ]


def _custom_values(session: Session, deal_id: str) -> list[CustomFieldValueRead]:
    rows = session.exec(
        select(CustomFieldDef, CustomFieldValue)
        .join(CustomFieldValue, CustomFieldValue.field_id == CustomFieldDef.id)
        .where(
            CustomFieldDef.entity == "deal",
            CustomFieldValue.entity_id == deal_id,
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


def _read_deal(session: Session, deal: Deal) -> DealRead:
    return DealRead(
        id=deal.id,
        title=deal.title,
        pipeline_id=deal.pipeline_id,
        stage_id=deal.stage_id,
        stage_name=_stage_name(session, deal.stage_id) or "",
        organization_id=deal.organization_id,
        organization_name=_organization_name(session, deal.organization_id),
        primary_contact_id=deal.primary_contact_id,
        primary_contact_name=_contact_name(session, deal.primary_contact_id),
        owner=deal.owner,
        amount_cents=deal.amount_cents,
        currency=deal.currency,
        probability=deal.probability,
        expected_close_date=deal.expected_close_date,
        status=deal.status,  # type: ignore[arg-type]
        won_at=deal.won_at,
        lost_at=deal.lost_at,
        lost_reason=deal.lost_reason,
        description=deal.description,
        created_at=deal.created_at,
        updated_at=deal.updated_at,
        stage_history=_stage_history(session, deal.id),
        activities=_activities_of(session, deal.id),
        notes=_notes_of(session, deal.id),
        custom_fields=_custom_values(session, deal.id),
    )


@router.get("", response_model=list[DealSummary])
def list_deals(
    q: str | None = Query(default=None),
    pipeline_id: str | None = Query(default=None),
    stage_id: str | None = Query(default=None),
    status_filter: DealStatus | None = Query(default=None, alias="status"),
    owner: str | None = Query(default=None),
    min_amount_cents: int | None = Query(default=None, ge=0),
    max_amount_cents: int | None = Query(default=None, ge=0),
    close_from: datetime | None = Query(default=None),
    close_to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[DealSummary]:
    stmt = select(Deal)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Deal.title).like(like))
    if pipeline_id:
        stmt = stmt.where(Deal.pipeline_id == pipeline_id)
    if stage_id:
        stmt = stmt.where(Deal.stage_id == stage_id)
    if status_filter:
        stmt = stmt.where(Deal.status == status_filter)
    if owner:
        stmt = stmt.where(Deal.owner == owner)
    if min_amount_cents is not None:
        stmt = stmt.where(Deal.amount_cents >= min_amount_cents)
    if max_amount_cents is not None:
        stmt = stmt.where(Deal.amount_cents <= max_amount_cents)
    if close_from is not None:
        stmt = stmt.where(Deal.expected_close_date >= to_naive_utc(close_from))
    if close_to is not None:
        stmt = stmt.where(Deal.expected_close_date <= to_naive_utc(close_to))
    stmt = stmt.order_by(Deal.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)  # type: ignore[attr-defined]
    deals = list(session.exec(stmt).all())
    return [_summary(session, d) for d in deals]


@router.post("", response_model=DealRead, status_code=status.HTTP_201_CREATED)
def create_deal(payload: DealWrite, session: Session = Depends(get_session)) -> DealRead:
    stage = get_stage_or_400(session, payload.stage_id)
    assert_stage_in_pipeline(stage, payload.pipeline_id)

    if payload.organization_id is not None:
        if session.get(Organization, payload.organization_id) is None:
            raise HTTPException(status_code=404, detail="Organization not found")
    if payload.primary_contact_id is not None:
        if session.get(Contact, payload.primary_contact_id) is None:
            raise HTTPException(status_code=404, detail="Contact not found")

    probability = (
        payload.probability if payload.probability is not None else stage.probability_default
    )
    deal = Deal(
        title=payload.title,
        organization_id=payload.organization_id,
        primary_contact_id=payload.primary_contact_id,
        pipeline_id=payload.pipeline_id,
        stage_id=payload.stage_id,
        owner=payload.owner,
        amount_cents=payload.amount_cents,
        currency=payload.currency,
        probability=probability,
        expected_close_date=payload.expected_close_date,
        description=payload.description,
        status="open" if not (stage.is_won or stage.is_lost) else ("won" if stage.is_won else "lost"),
        won_at=utcnow() if stage.is_won else None,
        lost_at=utcnow() if stage.is_lost else None,
    )
    session.add(deal)
    session.flush()
    session.add(
        DealStageHistory(
            deal_id=deal.id,
            from_stage_id=None,
            to_stage_id=stage.id,
            note="created",
            changed_at=utcnow(),
        )
    )
    _record_deal_field_values(session, payload.model_dump())
    session.commit()
    session.refresh(deal)
    return _read_deal(session, deal)


@router.get("/{deal_id}", response_model=DealRead)
def get_deal(deal_id: str, session: Session = Depends(get_session)) -> DealRead:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    return _read_deal(session, deal)


@router.patch("/{deal_id}", response_model=DealRead)
def patch_deal(
    deal_id: str, payload: DealPatch, session: Session = Depends(get_session)
) -> DealRead:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    data = payload.model_dump(exclude_unset=True)

    if "organization_id" in data and data["organization_id"] is not None:
        if session.get(Organization, data["organization_id"]) is None:
            raise HTTPException(status_code=404, detail="Organization not found")
    if "primary_contact_id" in data and data["primary_contact_id"] is not None:
        if session.get(Contact, data["primary_contact_id"]) is None:
            raise HTTPException(status_code=404, detail="Contact not found")

    for key, value in data.items():
        setattr(deal, key, value)
    deal.updated_at = utcnow()
    session.add(deal)
    _record_deal_field_values(session, data)
    session.commit()
    session.refresh(deal)
    return _read_deal(session, deal)


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deal(deal_id: str, session: Session = Depends(get_session)) -> None:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    session.exec(
        DealStageHistory.__table__.delete().where(DealStageHistory.deal_id == deal_id)  # type: ignore[attr-defined]
    )
    session.exec(Note.__table__.delete().where(Note.deal_id == deal_id))  # type: ignore[attr-defined]
    session.exec(Activity.__table__.delete().where(Activity.deal_id == deal_id))  # type: ignore[attr-defined]
    session.delete(deal)
    session.commit()


@router.post("/{deal_id}/move", response_model=DealRead)
def move_deal(
    deal_id: str, payload: DealMove, session: Session = Depends(get_session)
) -> DealRead:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    stage = get_stage_or_400(session, payload.stage_id)
    assert_stage_in_pipeline(stage, deal.pipeline_id)
    record_stage_change(session, deal, payload.stage_id, payload.note)
    if stage.is_won:
        deal.status = "won"
        deal.won_at = utcnow()
        deal.lost_at = None
        deal.lost_reason = None
        deal.probability = 100
    elif stage.is_lost:
        deal.status = "lost"
        deal.lost_at = utcnow()
        deal.won_at = None
        deal.probability = 0
    else:
        deal.status = "open"
        deal.won_at = None
        deal.lost_at = None
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return _read_deal(session, deal)


@router.post("/{deal_id}/win", response_model=DealRead)
def win_deal(
    deal_id: str, payload: DealWin, session: Session = Depends(get_session)
) -> DealRead:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    won_stage = first_stage_of_kind(session, deal.pipeline_id, won=True)
    if won_stage is None:
        raise HTTPException(
            status_code=409, detail="Pipeline has no stage flagged as won"
        )
    record_stage_change(session, deal, won_stage.id, payload.note or "won")
    deal.status = "won"
    deal.won_at = utcnow()
    deal.lost_at = None
    deal.lost_reason = None
    deal.probability = 100
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return _read_deal(session, deal)


@router.post("/{deal_id}/lose", response_model=DealRead)
def lose_deal(
    deal_id: str, payload: DealLose, session: Session = Depends(get_session)
) -> DealRead:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    lost_stage = first_stage_of_kind(session, deal.pipeline_id, lost=True)
    if lost_stage is None:
        raise HTTPException(
            status_code=409, detail="Pipeline has no stage flagged as lost"
        )
    record_stage_change(session, deal, lost_stage.id, payload.note or payload.reason)
    deal.status = "lost"
    deal.lost_at = utcnow()
    deal.won_at = None
    deal.lost_reason = payload.reason
    deal.probability = 0
    session.add(deal)
    record_values(session, {"deal.lost_reason": payload.reason})
    session.commit()
    session.refresh(deal)
    return _read_deal(session, deal)


@router.post("/{deal_id}/reopen", response_model=DealRead)
def reopen_deal(deal_id: str, session: Session = Depends(get_session)) -> DealRead:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    if deal.status == "open":
        return _read_deal(session, deal)

    # Move back to the first non-terminal stage of the pipeline.
    target_stage = session.exec(
        select(PipelineStage)
        .where(
            PipelineStage.pipeline_id == deal.pipeline_id,
            PipelineStage.is_won == False,  # noqa: E712
            PipelineStage.is_lost == False,  # noqa: E712
        )
        .order_by(PipelineStage.position)  # type: ignore[attr-defined]
    ).first()
    if target_stage is None:
        raise HTTPException(
            status_code=409, detail="Pipeline has no open stages to reopen into"
        )
    record_stage_change(session, deal, target_stage.id, "reopened")
    deal.status = "open"
    deal.won_at = None
    deal.lost_at = None
    deal.lost_reason = None
    deal.probability = target_stage.probability_default
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return _read_deal(session, deal)
