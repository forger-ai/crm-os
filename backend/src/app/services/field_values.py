"""Free-text field value registry.

Every time a tracked open field is written, the entered value is recorded
under a scope (e.g. "deal.owner", "organization.industry") so the frontend
can autocomplete previously used values.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.models import FieldValue, utcnow

# Mapping of every entity field whose value should land in the registry.
# Keep this list in sync with what the UI exposes as free-text inputs.
TRACKED_SCOPES: dict[str, list[str]] = {
    "organization": ["industry", "owner", "address"],
    "contact": ["job_title", "owner"],
    "contact_organization": ["role"],
    "deal": ["owner", "currency", "lost_reason"],
    "activity": ["owner"],
}


def is_tracked(scope: str) -> bool:
    entity, _, field = scope.partition(".")
    if not field:
        return False
    return field in TRACKED_SCOPES.get(entity, [])


def record_value(session: Session, scope: str, value: str | None) -> None:
    """Upsert a single (scope, value) into the registry.

    Caller is responsible for the surrounding session/commit. We only flush
    at the end so failures bubble up naturally to the caller.
    """
    if value is None:
        return
    cleaned = str(value).strip()
    if not cleaned:
        return
    if not is_tracked(scope):
        return

    lower = cleaned.lower()
    existing = session.exec(
        select(FieldValue).where(
            FieldValue.scope == scope,
            FieldValue.value_lower == lower,
        )
    ).first()

    now = utcnow()
    if existing is None:
        session.add(
            FieldValue(
                scope=scope,
                value=cleaned,
                value_lower=lower,
                usage_count=1,
                last_used_at=now,
            )
        )
    else:
        existing.usage_count += 1
        existing.last_used_at = now
        existing.value = cleaned  # keep latest casing the user typed
        session.add(existing)


def record_values(session: Session, entries: dict[str, str | None]) -> None:
    """Convenience: record many (scope → value) pairs in one call."""
    for scope, value in entries.items():
        record_value(session, scope, value)


def list_values(
    session: Session,
    scope: str,
    query: str | None = None,
    limit: int = 25,
) -> list[FieldValue]:
    stmt = select(FieldValue).where(FieldValue.scope == scope)
    if query:
        like = f"%{query.lower()}%"
        stmt = stmt.where(FieldValue.value_lower.like(like))  # type: ignore[attr-defined]
    stmt = stmt.order_by(FieldValue.usage_count.desc(), FieldValue.last_used_at.desc()).limit(limit)  # type: ignore[attr-defined]
    return list(session.exec(stmt).all())


def list_scopes(session: Session) -> list[str]:
    rows = session.exec(select(FieldValue.scope).distinct()).all()
    return sorted({r for r in rows})
