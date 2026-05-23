from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.database import get_session
from app.schemas import FieldValueRead
from app.services.field_values import list_scopes, list_values

router = APIRouter(prefix="/api/field-values", tags=["field-values"])


@router.get("", response_model=list[FieldValueRead])
def list_field_values(
    scope: str = Query(..., min_length=1, max_length=64),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=25, ge=1, le=200),
    session: Session = Depends(get_session),
) -> list[FieldValueRead]:
    rows = list_values(session, scope=scope, query=q, limit=limit)
    return [
        FieldValueRead(
            scope=row.scope,
            value=row.value,
            usage_count=row.usage_count,
            last_used_at=row.last_used_at,
        )
        for row in rows
    ]


@router.get("/scopes", response_model=list[str])
def list_field_value_scopes(
    session: Session = Depends(get_session),
) -> list[str]:
    return list_scopes(session)
