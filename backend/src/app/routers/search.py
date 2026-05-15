from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, func, select

from app.database import get_session
from app.models import Contact, Deal, Organization
from app.schemas import SearchHit, SearchResults

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResults)
def search(
    q: str = Query(..., min_length=1, max_length=120),
    limit: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
) -> SearchResults:
    like = f"%{q.lower()}%"

    org_rows = list(
        session.exec(
            select(Organization)
            .where(
                (func.lower(Organization.name).like(like))
                | (func.lower(func.coalesce(Organization.domain, "")).like(like))
            )
            .order_by(Organization.name)  # type: ignore[attr-defined]
            .limit(limit)
        ).all()
    )

    contact_rows = list(
        session.exec(
            select(Contact)
            .where(
                (func.lower(Contact.first_name).like(like))
                | (func.lower(func.coalesce(Contact.last_name, "")).like(like))
                | (func.lower(func.coalesce(Contact.email, "")).like(like))
            )
            .order_by(Contact.first_name)  # type: ignore[attr-defined]
            .limit(limit)
        ).all()
    )

    deal_rows = list(
        session.exec(
            select(Deal)
            .where(func.lower(Deal.title).like(like))
            .order_by(Deal.updated_at.desc())  # type: ignore[attr-defined]
            .limit(limit)
        ).all()
    )

    return SearchResults(
        organizations=[
            SearchHit(
                entity="organization",
                id=org.id,
                label=org.name,
                sublabel=org.industry or org.domain,
            )
            for org in org_rows
        ],
        contacts=[
            SearchHit(
                entity="contact",
                id=c.id,
                label=f"{c.first_name} {c.last_name or ''}".strip(),
                sublabel=c.email or c.job_title,
            )
            for c in contact_rows
        ],
        deals=[
            SearchHit(
                entity="deal",
                id=d.id,
                label=d.title,
                sublabel=f"{d.currency} {d.amount_cents / 100:.2f} · {d.status}",
            )
            for d in deal_rows
        ],
    )
