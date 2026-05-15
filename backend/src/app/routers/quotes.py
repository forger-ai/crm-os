from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, func, select

from app.database import get_session
from app.models import Deal, Product, Quote, QuoteLine, utcnow
from app.schemas import (
    QuoteLinePatch,
    QuoteLineRead,
    QuoteLineWrite,
    QuotePatch,
    QuoteRead,
    QuoteStatus,
    QuoteSummary,
    QuoteWrite,
)
from app.services.field_values import record_values
from app.services.quotes import (
    assert_editable,
    maybe_expire,
    next_quote_number,
    recalculate_totals,
    reorder_line_positions,
    transition,
)

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


def _line_read(line: QuoteLine) -> QuoteLineRead:
    return QuoteLineRead(
        id=line.id,
        quote_id=line.quote_id,
        position=line.position,
        product_id=line.product_id,
        name=line.name,
        description=line.description,
        quantity=line.quantity,
        unit_price_cents=line.unit_price_cents,
        discount_pct=line.discount_pct,
        line_total_cents=line.line_total_cents,
    )


def _summary(quote: Quote) -> QuoteSummary:
    return QuoteSummary(
        id=quote.id,
        deal_id=quote.deal_id,
        number=quote.number,
        title=quote.title,
        status=quote.status,  # type: ignore[arg-type]
        currency=quote.currency,
        total_cents=quote.total_cents,
        valid_until=quote.valid_until,
        sent_at=quote.sent_at,
        decided_at=quote.decided_at,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
    )


def _read(session: Session, quote: Quote) -> QuoteRead:
    lines = list(
        session.exec(
            select(QuoteLine)
            .where(QuoteLine.quote_id == quote.id)
            .order_by(QuoteLine.position)
        ).all()
    )
    return QuoteRead(
        **_summary(quote).model_dump(),
        subtotal_cents=quote.subtotal_cents,
        tax_rate=quote.tax_rate,
        tax_cents=quote.tax_cents,
        notes=quote.notes,
        lines=[_line_read(line) for line in lines],
    )


@router.get("", response_model=list[QuoteSummary])
def list_quotes(
    deal_id: str | None = Query(default=None),
    status_filter: QuoteStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[QuoteSummary]:
    stmt = select(Quote)
    if deal_id:
        stmt = stmt.where(Quote.deal_id == deal_id)
    if status_filter:
        stmt = stmt.where(Quote.status == status_filter)
    stmt = (
        stmt.order_by(Quote.created_at.desc())  # type: ignore[attr-defined]
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(session.exec(stmt).all())
    return [_summary(maybe_expire(quote)) for quote in rows]


@router.post("", response_model=QuoteRead, status_code=status.HTTP_201_CREATED)
def create_quote(
    payload: QuoteWrite, session: Session = Depends(get_session)
) -> QuoteRead:
    deal = session.get(Deal, payload.deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")

    quote = Quote(
        deal_id=deal.id,
        number=next_quote_number(session),
        title=payload.title,
        currency=payload.currency or deal.currency,
        tax_rate=payload.tax_rate,
        valid_until=payload.valid_until,
        notes=payload.notes,
    )
    session.add(quote)
    session.flush()

    for index, line in enumerate(payload.lines):
        _attach_product_defaults(session, quote.currency, line)
        session.add(
            QuoteLine(
                quote_id=quote.id,
                position=index,
                product_id=line.product_id,
                name=line.name,
                description=line.description,
                quantity=line.quantity,
                unit_price_cents=line.unit_price_cents,
                discount_pct=line.discount_pct,
            )
        )
    session.flush()
    recalculate_totals(session, quote)
    record_values(session, {"deal.currency": quote.currency})
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


@router.get("/{quote_id}", response_model=QuoteRead)
def get_quote(quote_id: str, session: Session = Depends(get_session)) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    maybe_expire(quote)
    session.add(quote)
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


@router.patch("/{quote_id}", response_model=QuoteRead)
def patch_quote(
    quote_id: str,
    payload: QuotePatch,
    session: Session = Depends(get_session),
) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    assert_editable(quote)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(quote, key, value)
    recalculate_totals(session, quote)
    record_values(session, {"deal.currency": data.get("currency")})
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quote(quote_id: str, session: Session = Depends(get_session)) -> None:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.status not in ("draft", "expired"):
        raise ValueError(
            "Only draft or expired quotes can be deleted; sent/accepted/rejected "
            "quotes keep their audit trail"
        )
    session.exec(
        select(QuoteLine).where(QuoteLine.quote_id == quote.id)
    )  # ensure cascade rows exist
    for line in session.exec(select(QuoteLine).where(QuoteLine.quote_id == quote.id)).all():
        session.delete(line)
    session.delete(quote)
    session.commit()


# ── Line items ──────────────────────────────────────────────────────────────


def _attach_product_defaults(
    session: Session, quote_currency: str, line: QuoteLineWrite | QuoteLinePatch
) -> None:
    """When the agent (or UI) provides product_id without unit price, pull the
    product default. We do NOT auto-convert currency: the line stays in the
    quote's currency, copying the number from the product as-is. The user
    adjusts if needed.
    """
    product_id = getattr(line, "product_id", None)
    if not product_id:
        return
    if (
        getattr(line, "unit_price_cents", None) not in (None, 0)
        and getattr(line, "name", None)
    ):
        return
    product = session.get(Product, product_id)
    if product is None:
        return
    if getattr(line, "unit_price_cents", None) in (None, 0):
        line.unit_price_cents = product.default_unit_price_cents  # type: ignore[union-attr]
    if not getattr(line, "name", None):
        line.name = product.name  # type: ignore[union-attr]
    _ = quote_currency  # currency match is the caller's responsibility


@router.post(
    "/{quote_id}/lines",
    response_model=QuoteRead,
    status_code=status.HTTP_201_CREATED,
)
def add_line(
    quote_id: str,
    payload: QuoteLineWrite,
    session: Session = Depends(get_session),
) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    assert_editable(quote)
    _attach_product_defaults(session, quote.currency, payload)
    last_position = session.exec(
        select(func.max(QuoteLine.position)).where(QuoteLine.quote_id == quote.id)
    ).first()
    next_position = 0 if last_position is None else int(last_position) + 1
    line = QuoteLine(
        quote_id=quote.id,
        position=next_position,
        product_id=payload.product_id,
        name=payload.name,
        description=payload.description,
        quantity=payload.quantity,
        unit_price_cents=payload.unit_price_cents,
        discount_pct=payload.discount_pct,
    )
    session.add(line)
    session.flush()
    recalculate_totals(session, quote)
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


@router.patch(
    "/{quote_id}/lines/{line_id}", response_model=QuoteRead
)
def patch_line(
    quote_id: str,
    line_id: str,
    payload: QuoteLinePatch,
    session: Session = Depends(get_session),
) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    assert_editable(quote)
    line = session.get(QuoteLine, line_id)
    if line is None or line.quote_id != quote.id:
        raise HTTPException(status_code=404, detail="Quote line not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(line, key, value)
    line.updated_at = utcnow()
    session.add(line)
    session.flush()
    recalculate_totals(session, quote)
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


@router.delete(
    "/{quote_id}/lines/{line_id}", response_model=QuoteRead
)
def delete_line(
    quote_id: str,
    line_id: str,
    session: Session = Depends(get_session),
) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    assert_editable(quote)
    line = session.get(QuoteLine, line_id)
    if line is None or line.quote_id != quote.id:
        raise HTTPException(status_code=404, detail="Quote line not found")
    session.delete(line)
    session.flush()
    reorder_line_positions(session, quote.id)
    session.flush()
    recalculate_totals(session, quote)
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


# ── Status transitions ──────────────────────────────────────────────────────


@router.post("/{quote_id}/send", response_model=QuoteRead)
def send_quote(quote_id: str, session: Session = Depends(get_session)) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    transition(quote, "sent")
    session.add(quote)
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


@router.post("/{quote_id}/accept", response_model=QuoteRead)
def accept_quote(quote_id: str, session: Session = Depends(get_session)) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    transition(quote, "accepted")
    session.add(quote)
    session.commit()
    session.refresh(quote)
    return _read(session, quote)


@router.post("/{quote_id}/reject", response_model=QuoteRead)
def reject_quote(quote_id: str, session: Session = Depends(get_session)) -> QuoteRead:
    quote = session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    transition(quote, "rejected")
    session.add(quote)
    session.commit()
    session.refresh(quote)
    return _read(session, quote)
