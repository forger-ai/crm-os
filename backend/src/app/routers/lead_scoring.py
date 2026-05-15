from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.database import get_session
from app.models import Deal, PipelineStage
from app.schemas import (
    LeadScoreEntry,
    LeadScoreFactor,
    LeadScoreRead,
    LeadScoreReport,
)
from app.services.lead_scoring import compute_score

router = APIRouter(prefix="/api", tags=["lead-scoring"])


def _factor_payload(factors) -> list[LeadScoreFactor]:
    return [
        LeadScoreFactor(
            key=factor.key,
            label=factor.label,
            contribution=factor.contribution,
            detail=factor.detail,
        )
        for factor in factors
    ]


@router.get("/deals/{deal_id}/score", response_model=LeadScoreRead)
def get_deal_score(
    deal_id: str, session: Session = Depends(get_session)
) -> LeadScoreRead:
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    score = compute_score(session, deal)
    return LeadScoreRead(
        deal_id=score.deal_id,
        score=score.score,
        band=score.band,
        factors=_factor_payload(score.factors),
        computed_at=score.computed_at,
    )


@router.get("/reports/lead-scoring", response_model=LeadScoreReport)
def get_lead_scoring_report(
    pipeline_id: str | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=50),
    session: Session = Depends(get_session),
) -> LeadScoreReport:
    stmt = select(Deal).where(Deal.status == "open")
    if pipeline_id:
        stmt = stmt.where(Deal.pipeline_id == pipeline_id)
    deals = list(session.exec(stmt).all())

    # Pre-resolve stage names to avoid N+1 queries inside the loop.
    stage_ids = {deal.stage_id for deal in deals}
    stage_names: dict[str, str] = {}
    if stage_ids:
        stages = session.exec(
            select(PipelineStage).where(PipelineStage.id.in_(stage_ids))  # type: ignore[attr-defined]
        ).all()
        stage_names = {stage.id: stage.name for stage in stages}

    scored: list[tuple[int, LeadScoreEntry]] = []
    for deal in deals:
        score = compute_score(session, deal)
        scored.append(
            (
                score.score,
                LeadScoreEntry(
                    deal_id=deal.id,
                    deal_title=deal.title,
                    score=score.score,
                    band=score.band,
                    stage_name=stage_names.get(deal.stage_id, ""),
                    amount_cents=deal.amount_cents,
                    currency=deal.currency,
                    owner=deal.owner,
                ),
            )
        )

    scored.sort(key=lambda item: item[0], reverse=True)
    hot = [entry for _, entry in scored[:limit]]
    cold = [entry for _, entry in sorted(scored, key=lambda item: item[0])[:limit]]
    return LeadScoreReport(hot=hot, cold=cold)
