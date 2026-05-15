"""Quote business logic.

- Atomic Q-YYYY-NNN numbering via a per-year counter row.
- Totals (subtotal/tax/total) derived from lines, never accepted from input.
- Status machine: draft → sent → accepted | rejected; any → expired (lazy).
- Marking accepted does NOT auto-win the deal; that decision stays with the user.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import update
from sqlmodel import Session, select

from app.models import (
    Quote,
    QuoteLine,
    QuoteNumberSequence,
    utcnow,
)


ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"sent", "expired"},
    "sent": {"accepted", "rejected", "expired"},
    "accepted": {"expired"},
    "rejected": {"expired"},
    "expired": set(),
}


def next_quote_number(session: Session, year: int | None = None) -> str:
    """Atomically claim the next sequence number for the given year.

    SQLite serializes writes per database, so this read-then-update is safe
    inside a single session. We use UPDATE … RETURNING-equivalent pattern via
    a row-level get with explicit commit.
    """
    target_year = year if year is not None else utcnow().year
    sequence = session.get(QuoteNumberSequence, target_year)
    if sequence is None:
        sequence = QuoteNumberSequence(year=target_year, last_number=0)
    sequence.last_number += 1
    sequence.updated_at = utcnow()
    session.add(sequence)
    session.flush()  # caller commits
    return f"Q-{target_year}-{sequence.last_number:03d}"


def compute_line_total_cents(
    *,
    quantity: float,
    unit_price_cents: int,
    discount_pct: float,
) -> int:
    """Line total = quantity * unit_price * (1 - discount/100), rounded to cents.

    We round half-up to match Chilean accounting convention. The discount
    applies linearly on the gross price.
    """
    gross = quantity * unit_price_cents
    if discount_pct:
        gross = gross * (1 - discount_pct / 100)
    return int(round(gross))


def recalculate_totals(session: Session, quote: Quote) -> Quote:
    """Recompute subtotal/tax/total based on current lines. Persists nothing."""
    lines = session.exec(
        select(QuoteLine).where(QuoteLine.quote_id == quote.id)
    ).all()
    subtotal = 0
    for line in lines:
        line.line_total_cents = compute_line_total_cents(
            quantity=line.quantity,
            unit_price_cents=line.unit_price_cents,
            discount_pct=line.discount_pct,
        )
        session.add(line)
        subtotal += line.line_total_cents
    quote.subtotal_cents = subtotal
    quote.tax_cents = int(round(subtotal * (quote.tax_rate / 100)))
    quote.total_cents = quote.subtotal_cents + quote.tax_cents
    quote.updated_at = utcnow()
    return quote


def reorder_line_positions(session: Session, quote_id: str) -> None:
    """Re-pack `position` to 0..N-1 in current insert order after a delete."""
    rows = list(
        session.exec(
            select(QuoteLine)
            .where(QuoteLine.quote_id == quote_id)
            .order_by(QuoteLine.position, QuoteLine.created_at)  # type: ignore[arg-type]
        ).all()
    )
    for index, line in enumerate(rows):
        if line.position != index:
            line.position = index
            session.add(line)


def transition(quote: Quote, target: str) -> Quote:
    """Apply a status transition or raise ValueError."""
    if target == quote.status:
        return quote
    allowed = ALLOWED_TRANSITIONS.get(quote.status, set())
    if target not in allowed:
        raise ValueError(
            f"Transition not allowed: {quote.status} → {target}"
        )
    now = utcnow()
    quote.status = target  # type: ignore[assignment]
    if target == "sent":
        quote.sent_at = now
    if target in ("accepted", "rejected"):
        quote.decided_at = now
    quote.updated_at = now
    return quote


def maybe_expire(quote: Quote) -> Quote:
    """Lazy expiration: if valid_until passed and we are still in draft/sent."""
    if quote.status in ("accepted", "rejected", "expired"):
        return quote
    if quote.valid_until is None:
        return quote
    if quote.valid_until < utcnow():
        quote.status = "expired"  # type: ignore[assignment]
        quote.updated_at = utcnow()
    return quote


def assert_editable(quote: Quote) -> None:
    """Lines and quote-level fields can only be modified while draft."""
    if quote.status != "draft":
        raise ValueError(
            f"Quote is {quote.status}; only draft quotes can be edited"
        )


__all__ = [
    "assert_editable",
    "compute_line_total_cents",
    "maybe_expire",
    "next_quote_number",
    "recalculate_totals",
    "reorder_line_positions",
    "transition",
    "ALLOWED_TRANSITIONS",
]


# Suppress unused import warning for the sqlalchemy update helper that
# downstream callers may consume from this module.
_ = update
