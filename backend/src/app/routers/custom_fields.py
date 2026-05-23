from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import CustomFieldDef, CustomFieldValue, utcnow
from app.schemas import (
    CustomFieldDefPatch,
    CustomFieldDefRead,
    CustomFieldDefWrite,
    CustomFieldEntity,
    CustomFieldValueRead,
    CustomFieldValueWrite,
)

router = APIRouter(prefix="/api/custom-fields", tags=["custom-fields"])

_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def _read_def(definition: CustomFieldDef) -> CustomFieldDefRead:
    options: list[str] | None = None
    if definition.options_json:
        try:
            parsed = json.loads(definition.options_json)
            if isinstance(parsed, list):
                options = [str(o) for o in parsed]
        except json.JSONDecodeError:
            options = None
    return CustomFieldDefRead(
        id=definition.id,
        entity=definition.entity,  # type: ignore[arg-type]
        key=definition.key,
        label=definition.label,
        type=definition.type,  # type: ignore[arg-type]
        options=options,
        position=definition.position,
        archived=definition.archived,
    )


def _next_position(session: Session, entity: str) -> int:
    rows = list(
        session.exec(
            select(CustomFieldDef.position).where(CustomFieldDef.entity == entity)
        ).all()
    )
    return (max(rows) + 1) if rows else 0


@router.get("", response_model=list[CustomFieldDefRead])
def list_custom_fields(
    entity: CustomFieldEntity | None = Query(default=None),
    include_archived: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> list[CustomFieldDefRead]:
    stmt = select(CustomFieldDef)
    if entity:
        stmt = stmt.where(CustomFieldDef.entity == entity)
    if not include_archived:
        stmt = stmt.where(CustomFieldDef.archived == False)  # noqa: E712
    stmt = stmt.order_by(CustomFieldDef.entity, CustomFieldDef.position)  # type: ignore[attr-defined]
    return [_read_def(definition) for definition in session.exec(stmt).all()]


@router.post(
    "", response_model=CustomFieldDefRead, status_code=status.HTTP_201_CREATED
)
def create_custom_field(
    payload: CustomFieldDefWrite,
    session: Session = Depends(get_session),
) -> CustomFieldDefRead:
    if not _KEY_RE.match(payload.key):
        raise ValueError("key must be lowercase letters, digits, and underscores")
    if payload.type == "select" and not payload.options:
        raise ValueError("select fields require non-empty options")

    existing = session.exec(
        select(CustomFieldDef).where(
            CustomFieldDef.entity == payload.entity,
            CustomFieldDef.key == payload.key,
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"A custom field with key '{payload.key}' already exists for {payload.entity}",
        )

    definition = CustomFieldDef(
        entity=payload.entity,
        key=payload.key,
        label=payload.label,
        type=payload.type,
        options_json=json.dumps(payload.options) if payload.options else None,
        position=_next_position(session, payload.entity),
    )
    session.add(definition)
    session.commit()
    session.refresh(definition)
    return _read_def(definition)


@router.patch("/{field_id}", response_model=CustomFieldDefRead)
def patch_custom_field(
    field_id: str,
    payload: CustomFieldDefPatch,
    session: Session = Depends(get_session),
) -> CustomFieldDefRead:
    definition = session.get(CustomFieldDef, field_id)
    if definition is None:
        raise HTTPException(status_code=404, detail="Custom field not found")
    data = payload.model_dump(exclude_unset=True)
    if "options" in data:
        if data["options"] is not None and definition.type != "select":
            raise ValueError("options can only be set on select fields")
        definition.options_json = (
            json.dumps(data["options"]) if data["options"] else None
        )
        data.pop("options")
    for key, value in data.items():
        setattr(definition, key, value)
    definition.updated_at = utcnow()
    session.add(definition)
    session.commit()
    session.refresh(definition)
    return _read_def(definition)


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_field(
    field_id: str, session: Session = Depends(get_session)
) -> None:
    definition = session.get(CustomFieldDef, field_id)
    if definition is None:
        raise HTTPException(status_code=404, detail="Custom field not found")
    has_value = session.exec(
        select(CustomFieldValue).where(CustomFieldValue.field_id == field_id).limit(1)
    ).first()
    if has_value is not None:
        # Archive instead of destroying values
        definition.archived = True
        definition.updated_at = utcnow()
        session.add(definition)
        session.commit()
        return None
    session.delete(definition)
    session.commit()
    return None


# ── Values ──────────────────────────────────────────────────────────────────


@router.put(
    "/values/{entity}/{entity_id}",
    response_model=list[CustomFieldValueRead],
)
def upsert_values(
    entity: CustomFieldEntity,
    entity_id: str,
    payload: list[CustomFieldValueWrite],
    session: Session = Depends(get_session),
) -> list[CustomFieldValueRead]:
    field_ids = [item.field_id for item in payload]
    definitions = {
        d.id: d
        for d in session.exec(
            select(CustomFieldDef).where(
                CustomFieldDef.id.in_(field_ids),  # type: ignore[union-attr]
                CustomFieldDef.entity == entity,
            )
        ).all()
    }
    if len(definitions) != len(set(field_ids)):
        raise HTTPException(
            status_code=400, detail="One or more field_ids do not exist for this entity"
        )

    out: list[CustomFieldValueRead] = []
    for item in payload:
        definition = definitions[item.field_id]
        existing = session.exec(
            select(CustomFieldValue).where(
                CustomFieldValue.field_id == item.field_id,
                CustomFieldValue.entity_id == entity_id,
            )
        ).first()
        target = existing or CustomFieldValue(
            field_id=item.field_id, entity_id=entity_id
        )
        # reset typed columns then set the right one
        target.value_text = None
        target.value_number = None
        target.value_date = None
        target.value_bool = None
        if item.value is None:
            pass
        elif definition.type in ("text", "select"):
            target.value_text = str(item.value)
        elif definition.type == "number":
            target.value_number = float(item.value)
        elif definition.type == "date":
            from datetime import datetime as _dt

            if isinstance(item.value, str):
                target.value_date = _dt.fromisoformat(item.value)
            else:
                target.value_date = item.value  # type: ignore[assignment]
        elif definition.type == "bool":
            target.value_bool = bool(item.value)
        target.updated_at = utcnow()
        session.add(target)

        raw: Any = item.value
        out.append(
            CustomFieldValueRead(
                field_id=definition.id,
                key=definition.key,
                label=definition.label,
                type=definition.type,  # type: ignore[arg-type]
                value=raw,
            )
        )

    session.commit()
    return out
