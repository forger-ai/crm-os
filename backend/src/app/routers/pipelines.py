from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, select

from app.database import get_session
from app.models import Deal, Pipeline, PipelineStage, utcnow
from app.schemas import (
    PipelinePatch,
    PipelineRead,
    PipelineStagePatch,
    PipelineStageRead,
    PipelineStageWrite,
    PipelineWrite,
    StageReorder,
)

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])


def _stages_of(session: Session, pipeline_id: str) -> list[PipelineStage]:
    return list(
        session.exec(
            select(PipelineStage)
            .where(PipelineStage.pipeline_id == pipeline_id)
            .order_by(PipelineStage.position)  # type: ignore[attr-defined]
        ).all()
    )


def _read_pipeline(session: Session, pipeline: Pipeline) -> PipelineRead:
    stages = _stages_of(session, pipeline.id)
    return PipelineRead(
        id=pipeline.id,
        name=pipeline.name,
        is_default=pipeline.is_default,
        archived=pipeline.archived,
        position=pipeline.position,
        stages=[
            PipelineStageRead(
                id=stage.id,
                pipeline_id=stage.pipeline_id,
                name=stage.name,
                position=stage.position,
                probability_default=stage.probability_default,
                is_won=stage.is_won,
                is_lost=stage.is_lost,
                color=stage.color,
            )
            for stage in stages
        ],
    )


def _next_stage_position(session: Session, pipeline_id: str) -> int:
    max_position = session.exec(
        select(func.coalesce(func.max(PipelineStage.position), -1)).where(
            PipelineStage.pipeline_id == pipeline_id
        )
    ).first()
    return int(max_position or -1) + 1


@router.get("", response_model=list[PipelineRead])
def list_pipelines(session: Session = Depends(get_session)) -> list[PipelineRead]:
    pipelines = list(
        session.exec(select(Pipeline).order_by(Pipeline.position, Pipeline.name)).all()  # type: ignore[attr-defined]
    )
    return [_read_pipeline(session, p) for p in pipelines]


@router.post("", response_model=PipelineRead, status_code=status.HTTP_201_CREATED)
def create_pipeline(
    payload: PipelineWrite,
    session: Session = Depends(get_session),
) -> PipelineRead:
    if payload.is_default:
        # only one default pipeline at a time
        for existing in session.exec(select(Pipeline).where(Pipeline.is_default == True)).all():  # noqa: E712
            existing.is_default = False
            session.add(existing)

    next_position = session.exec(
        select(func.coalesce(func.max(Pipeline.position), -1))
    ).first()
    pipeline = Pipeline(
        name=payload.name,
        is_default=payload.is_default,
        position=int(next_position or -1) + 1,
    )
    session.add(pipeline)
    session.commit()
    session.refresh(pipeline)
    return _read_pipeline(session, pipeline)


@router.patch("/{pipeline_id}", response_model=PipelineRead)
def patch_pipeline(
    pipeline_id: str,
    payload: PipelinePatch,
    session: Session = Depends(get_session),
) -> PipelineRead:
    pipeline = session.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    data = payload.model_dump(exclude_unset=True)
    if data.get("is_default") is True:
        for existing in session.exec(
            select(Pipeline).where(
                Pipeline.is_default == True,  # noqa: E712
                Pipeline.id != pipeline_id,
            )
        ).all():
            existing.is_default = False
            session.add(existing)

    for key, value in data.items():
        setattr(pipeline, key, value)
    pipeline.updated_at = utcnow()
    session.add(pipeline)
    session.commit()
    session.refresh(pipeline)
    return _read_pipeline(session, pipeline)


@router.delete("/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pipeline(
    pipeline_id: str, session: Session = Depends(get_session)
) -> None:
    pipeline = session.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    has_deals = session.exec(
        select(Deal).where(Deal.pipeline_id == pipeline_id).limit(1)
    ).first()
    if has_deals is not None:
        raise HTTPException(
            status_code=409, detail="Pipeline still has deals; archive it instead"
        )

    session.exec(
        PipelineStage.__table__.delete().where(  # type: ignore[attr-defined]
            PipelineStage.pipeline_id == pipeline_id
        )
    )
    session.delete(pipeline)
    session.commit()


# ── Stages ──────────────────────────────────────────────────────────────────


@router.post(
    "/{pipeline_id}/stages",
    response_model=PipelineStageRead,
    status_code=status.HTTP_201_CREATED,
)
def create_stage(
    pipeline_id: str,
    payload: PipelineStageWrite,
    session: Session = Depends(get_session),
) -> PipelineStageRead:
    pipeline = session.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    stage = PipelineStage(
        pipeline_id=pipeline_id,
        name=payload.name,
        position=_next_stage_position(session, pipeline_id),
        probability_default=payload.probability_default,
        is_won=payload.is_won,
        is_lost=payload.is_lost,
        color=payload.color,
    )
    session.add(stage)
    session.commit()
    session.refresh(stage)
    return PipelineStageRead(
        id=stage.id,
        pipeline_id=stage.pipeline_id,
        name=stage.name,
        position=stage.position,
        probability_default=stage.probability_default,
        is_won=stage.is_won,
        is_lost=stage.is_lost,
        color=stage.color,
    )


@router.patch(
    "/{pipeline_id}/stages/{stage_id}",
    response_model=PipelineStageRead,
)
def patch_stage(
    pipeline_id: str,
    stage_id: str,
    payload: PipelineStagePatch,
    session: Session = Depends(get_session),
) -> PipelineStageRead:
    stage = session.get(PipelineStage, stage_id)
    if stage is None or stage.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Stage not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(stage, key, value)
    stage.updated_at = utcnow()
    session.add(stage)
    session.commit()
    session.refresh(stage)
    return PipelineStageRead(
        id=stage.id,
        pipeline_id=stage.pipeline_id,
        name=stage.name,
        position=stage.position,
        probability_default=stage.probability_default,
        is_won=stage.is_won,
        is_lost=stage.is_lost,
        color=stage.color,
    )


@router.delete(
    "/{pipeline_id}/stages/{stage_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_stage(
    pipeline_id: str,
    stage_id: str,
    session: Session = Depends(get_session),
) -> None:
    stage = session.get(PipelineStage, stage_id)
    if stage is None or stage.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Stage not found")
    has_deal = session.exec(
        select(Deal).where(Deal.stage_id == stage_id).limit(1)
    ).first()
    if has_deal is not None:
        raise HTTPException(
            status_code=409, detail="Stage still has deals; move them out first"
        )
    session.delete(stage)
    session.commit()


@router.post(
    "/{pipeline_id}/stages/reorder",
    response_model=PipelineRead,
)
def reorder_stages(
    pipeline_id: str,
    payload: StageReorder,
    session: Session = Depends(get_session),
) -> PipelineRead:
    pipeline = session.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    current = _stages_of(session, pipeline_id)
    if {s.id for s in current} != set(payload.stage_ids):
        raise HTTPException(
            status_code=400,
            detail="stage_ids must list every stage of the pipeline exactly once",
        )
    by_id = {s.id: s for s in current}
    for index, stage_id in enumerate(payload.stage_ids):
        stage = by_id[stage_id]
        stage.position = index
        stage.updated_at = utcnow()
        session.add(stage)
    session.commit()
    session.refresh(pipeline)
    return _read_pipeline(session, pipeline)
