from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.schemas import EmailSyncStatus
from app.services.email_sync import email_sync_status

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/email-status", response_model=EmailSyncStatus)
def get_email_sync_status(
    session: Session = Depends(get_session),
) -> EmailSyncStatus:
    """Counters for the Conexiones panel and the dashboard hint."""
    payload = email_sync_status(session, provider="gmail")
    return EmailSyncStatus(**payload)
