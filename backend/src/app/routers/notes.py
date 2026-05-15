from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import Contact, Deal, Note, Organization, utcnow
from app.schemas import NotePatch, NoteRead, NoteWrite

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _validate_anchor(
    session: Session,
    deal_id: str | None,
    contact_id: str | None,
    organization_id: str | None,
) -> None:
    if not any((deal_id, contact_id, organization_id)):
        raise ValueError("Note must reference at least one of deal, contact, or organization")
    if deal_id and session.get(Deal, deal_id) is None:
        raise HTTPException(status_code=404, detail="Deal not found")
    if contact_id and session.get(Contact, contact_id) is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    if organization_id and session.get(Organization, organization_id) is None:
        raise HTTPException(status_code=404, detail="Organization not found")


def _read(note: Note) -> NoteRead:
    return NoteRead(
        id=note.id,
        body=note.body,
        deal_id=note.deal_id,
        contact_id=note.contact_id,
        organization_id=note.organization_id,
        author=note.author,
        pinned=note.pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.get("", response_model=list[NoteRead])
def list_notes(
    deal_id: str | None = Query(default=None),
    contact_id: str | None = Query(default=None),
    organization_id: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[NoteRead]:
    if not any((deal_id, contact_id, organization_id)):
        raise HTTPException(
            status_code=400,
            detail="At least one of deal_id, contact_id, organization_id is required",
        )
    stmt = select(Note)
    if deal_id:
        stmt = stmt.where(Note.deal_id == deal_id)
    if contact_id:
        stmt = stmt.where(Note.contact_id == contact_id)
    if organization_id:
        stmt = stmt.where(Note.organization_id == organization_id)
    stmt = stmt.order_by(Note.pinned.desc(), Note.created_at.desc())  # type: ignore[attr-defined]
    rows = list(session.exec(stmt).all())
    return [_read(n) for n in rows]


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteWrite, session: Session = Depends(get_session)) -> NoteRead:
    _validate_anchor(session, payload.deal_id, payload.contact_id, payload.organization_id)
    note = Note(**payload.model_dump())
    session.add(note)
    session.commit()
    session.refresh(note)
    return _read(note)


@router.patch("/{note_id}", response_model=NoteRead)
def patch_note(
    note_id: str, payload: NotePatch, session: Session = Depends(get_session)
) -> NoteRead:
    note = session.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(note, key, value)
    note.updated_at = utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    return _read(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: str, session: Session = Depends(get_session)) -> None:
    note = session.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    session.delete(note)
    session.commit()
