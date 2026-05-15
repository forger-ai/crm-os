"""Deal-related domain logic: stage validation and transitions."""

from __future__ import annotations

from sqlmodel import Session, select

from app.models import Deal, DealStageHistory, PipelineStage, utcnow


def get_stage_or_400(session: Session, stage_id: str) -> PipelineStage:
    stage = session.get(PipelineStage, stage_id)
    if stage is None:
        raise ValueError(f"Stage {stage_id} not found")
    return stage


def assert_stage_in_pipeline(stage: PipelineStage, pipeline_id: str) -> None:
    if stage.pipeline_id != pipeline_id:
        raise ValueError(
            "Stage does not belong to the deal's pipeline"
        )


def record_stage_change(
    session: Session,
    deal: Deal,
    new_stage_id: str,
    note: str | None = None,
) -> None:
    """Update the deal stage and append a history row when it actually changes."""
    if deal.stage_id == new_stage_id:
        return
    stage = get_stage_or_400(session, new_stage_id)
    assert_stage_in_pipeline(stage, deal.pipeline_id)

    history = DealStageHistory(
        deal_id=deal.id,
        from_stage_id=deal.stage_id,
        to_stage_id=new_stage_id,
        note=note,
        changed_at=utcnow(),
    )
    session.add(history)
    deal.stage_id = new_stage_id
    deal.updated_at = utcnow()
    session.add(deal)


def first_stage_of_kind(
    session: Session, pipeline_id: str, *, won: bool = False, lost: bool = False
) -> PipelineStage | None:
    stmt = select(PipelineStage).where(PipelineStage.pipeline_id == pipeline_id)
    if won:
        stmt = stmt.where(PipelineStage.is_won == True)  # noqa: E712
    if lost:
        stmt = stmt.where(PipelineStage.is_lost == True)  # noqa: E712
    stmt = stmt.order_by(PipelineStage.position)  # type: ignore[attr-defined]
    return session.exec(stmt).first()
