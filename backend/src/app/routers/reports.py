from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.database import get_session
from app.models import Activity, Deal, DealStageHistory, PipelineStage, to_naive_utc, utcnow
from app.schemas import (
    ActivitiesOverview,
    ActivityRead,
    DealSummary,
    PipelineValueByStage,
    StageConversionPoint,
    WeeklySummary,
    WonLostByMonth,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _activity_read(activity: Activity) -> ActivityRead:
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
        created_at=activity.created_at,
        updated_at=activity.updated_at,
    )


@router.get("/pipeline-value", response_model=list[PipelineValueByStage])
def pipeline_value(
    pipeline_id: str | None = Query(default=None),
    owner: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[PipelineValueByStage]:
    stage_stmt = select(PipelineStage)
    if pipeline_id:
        stage_stmt = stage_stmt.where(PipelineStage.pipeline_id == pipeline_id)
    stages = list(session.exec(stage_stmt.order_by(PipelineStage.position)).all())  # type: ignore[attr-defined]

    deal_stmt = select(Deal).where(Deal.status == "open")
    if pipeline_id:
        deal_stmt = deal_stmt.where(Deal.pipeline_id == pipeline_id)
    if owner:
        deal_stmt = deal_stmt.where(Deal.owner == owner)
    deals = list(session.exec(deal_stmt).all())

    by_stage: dict[str, list[Deal]] = defaultdict(list)
    for deal in deals:
        by_stage[deal.stage_id].append(deal)

    result: list[PipelineValueByStage] = []
    for stage in stages:
        rows = by_stage.get(stage.id, [])
        currency_totals: dict[str, int] = defaultdict(int)
        for d in rows:
            currency_totals[d.currency] += d.amount_cents
        result.append(
            PipelineValueByStage(
                stage_id=stage.id,
                stage_name=stage.name,
                deals_count=len(rows),
                by_currency=dict(currency_totals),
            )
        )
    return result


@router.get("/won-lost-by-month", response_model=list[WonLostByMonth])
def won_lost_by_month(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    owner: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[WonLostByMonth]:
    stmt = select(Deal).where(Deal.status.in_(["won", "lost"]))  # type: ignore[union-attr]
    if owner:
        stmt = stmt.where(Deal.owner == owner)
    deals = list(session.exec(stmt).all())

    from_naive = to_naive_utc(from_)
    to_naive = to_naive_utc(to)

    buckets: dict[str, dict[str, int]] = defaultdict(
        lambda: {"won": 0, "lost": 0}
    )
    won_currency: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    lost_currency: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for d in deals:
        anchor = d.won_at if d.status == "won" else d.lost_at
        if anchor is None:
            continue
        if from_naive and anchor < from_naive:
            continue
        if to_naive and anchor > to_naive:
            continue
        month = anchor.strftime("%Y-%m")
        buckets[month][d.status] += 1
        if d.status == "won":
            won_currency[month][d.currency] += d.amount_cents
        else:
            lost_currency[month][d.currency] += d.amount_cents

    out: list[WonLostByMonth] = []
    for month in sorted(buckets.keys()):
        out.append(
            WonLostByMonth(
                month=month,
                won_count=buckets[month]["won"],
                lost_count=buckets[month]["lost"],
                won_by_currency=dict(won_currency.get(month, {})),
                lost_by_currency=dict(lost_currency.get(month, {})),
            )
        )
    return out


@router.get("/conversion", response_model=list[StageConversionPoint])
def conversion(
    pipeline_id: str,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[StageConversionPoint]:
    stages = list(
        session.exec(
            select(PipelineStage)
            .where(PipelineStage.pipeline_id == pipeline_id)
            .order_by(PipelineStage.position)  # type: ignore[attr-defined]
        ).all()
    )
    history_stmt = select(DealStageHistory).where(
        DealStageHistory.to_stage_id.in_([s.id for s in stages])  # type: ignore[union-attr]
    )
    from_naive = to_naive_utc(from_)
    to_naive = to_naive_utc(to)
    if from_naive:
        history_stmt = history_stmt.where(DealStageHistory.changed_at >= from_naive)
    if to_naive:
        history_stmt = history_stmt.where(DealStageHistory.changed_at <= to_naive)
    history = list(session.exec(history_stmt).all())

    entered: dict[str, set[str]] = defaultdict(set)
    moved_forward: dict[str, set[str]] = defaultdict(set)
    stage_position = {s.id: s.position for s in stages}

    for row in history:
        entered[row.to_stage_id].add(row.deal_id)
        if row.from_stage_id and row.from_stage_id in stage_position:
            from_pos = stage_position[row.from_stage_id]
            if row.to_stage_id in stage_position:
                to_pos = stage_position[row.to_stage_id]
                if to_pos > from_pos:
                    moved_forward[row.from_stage_id].add(row.deal_id)

    out: list[StageConversionPoint] = []
    for stage in stages:
        ent = len(entered.get(stage.id, set()))
        mf = len(moved_forward.get(stage.id, set()))
        rate = (mf / ent) if ent else 0.0
        out.append(
            StageConversionPoint(
                stage_id=stage.id,
                stage_name=stage.name,
                entered=ent,
                moved_forward=mf,
                conversion_rate=round(rate, 3),
            )
        )
    return out


def _activities_overview(session: Session, owner: str | None) -> ActivitiesOverview:
    now = utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = today_start + timedelta(days=7)
    last_30 = now - timedelta(days=30)

    stmt = select(Activity)
    if owner:
        stmt = stmt.where(Activity.owner == owner)
    activities = list(session.exec(stmt).all())

    overdue = sum(
        1
        for a in activities
        if a.completed_at is None
        and a.due_at is not None
        and a.due_at < today_start
    )
    due_today = sum(
        1
        for a in activities
        if a.completed_at is None
        and a.due_at is not None
        and today_start <= a.due_at < today_start + timedelta(days=1)
    )
    due_this_week = sum(
        1
        for a in activities
        if a.completed_at is None
        and a.due_at is not None
        and today_start <= a.due_at <= week_end
    )
    completed_recent = sum(
        1
        for a in activities
        if a.completed_at is not None and a.completed_at >= last_30
    )
    upcoming = [
        a
        for a in activities
        if a.completed_at is None
        and a.due_at is not None
        and today_start <= a.due_at <= week_end
    ]
    upcoming.sort(key=lambda a: a.due_at or now)
    return ActivitiesOverview(
        overdue=overdue,
        due_today=due_today,
        due_this_week=due_this_week,
        completed_last_30_days=completed_recent,
        upcoming=[_activity_read(a) for a in upcoming[:10]],
    )


@router.get("/activities-overview", response_model=ActivitiesOverview)
def activities_overview(
    owner: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> ActivitiesOverview:
    return _activities_overview(session, owner)


@router.get("/weekly-summary", response_model=WeeklySummary)
def weekly_summary(
    owner: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> WeeklySummary:
    now = utcnow()
    week_start = now - timedelta(days=7)

    open_stmt = select(Deal).where(Deal.status == "open")
    if owner:
        open_stmt = open_stmt.where(Deal.owner == owner)
    open_deals = list(session.exec(open_stmt).all())
    pipeline_value: dict[str, int] = defaultdict(int)
    for d in open_deals:
        pipeline_value[d.currency] += d.amount_cents

    won_stmt = select(Deal).where(
        Deal.status == "won", Deal.won_at >= week_start  # type: ignore[union-attr]
    )
    lost_stmt = select(Deal).where(
        Deal.status == "lost", Deal.lost_at >= week_start  # type: ignore[union-attr]
    )
    if owner:
        won_stmt = won_stmt.where(Deal.owner == owner)
        lost_stmt = lost_stmt.where(Deal.owner == owner)
    won_count = len(list(session.exec(won_stmt).all()))
    lost_count = len(list(session.exec(lost_stmt).all()))

    # Stale deals: no stage change in the last 30 days, still open.
    cutoff = now - timedelta(days=30)
    stale: list[DealSummary] = []
    for deal in open_deals:
        latest = session.exec(
            select(DealStageHistory.changed_at)
            .where(DealStageHistory.deal_id == deal.id)
            .order_by(DealStageHistory.changed_at.desc())  # type: ignore[attr-defined]
            .limit(1)
        ).first()
        anchor = latest if latest is not None else deal.created_at
        if anchor < cutoff:
            stage = session.get(PipelineStage, deal.stage_id)
            stale.append(
                DealSummary(
                    id=deal.id,
                    title=deal.title,
                    pipeline_id=deal.pipeline_id,
                    stage_id=deal.stage_id,
                    stage_name=stage.name if stage else "",
                    organization_id=deal.organization_id,
                    organization_name=None,
                    primary_contact_id=deal.primary_contact_id,
                    primary_contact_name=None,
                    owner=deal.owner,
                    amount_cents=deal.amount_cents,
                    currency=deal.currency,
                    probability=deal.probability,
                    expected_close_date=deal.expected_close_date,
                    status=deal.status,  # type: ignore[arg-type]
                    updated_at=deal.updated_at,
                )
            )

    return WeeklySummary(
        pipeline_value=dict(pipeline_value),
        deals_open=len(open_deals),
        deals_won_this_week=won_count,
        deals_lost_this_week=lost_count,
        activities=_activities_overview(session, owner),
        stale_deals=stale,
    )
