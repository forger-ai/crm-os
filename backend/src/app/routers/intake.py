from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.database import get_session
from app.models import IncomingLead
from app.schemas import (
    IncomingLeadRead,
    IntakeConfigRead,
    IntakeConfigUpdate,
    LeadAccept,
    ScanResult,
    ScanResultSummary,
)
from app.services import intake as intake_service

router = APIRouter(prefix="/api/intake", tags=["intake"])


@router.get("/config", response_model=IntakeConfigRead)
def get_intake_config(
    session: Session = Depends(get_session),
) -> IntakeConfigRead:
    """Polling config plus the window the next Gmail scan should use."""
    return intake_service.config_read(session)


@router.put("/config", response_model=IntakeConfigRead)
def put_intake_config(
    payload: IntakeConfigUpdate,
    session: Session = Depends(get_session),
) -> IntakeConfigRead:
    return intake_service.update_config(session, payload)


@router.post("/scan-result", response_model=ScanResultSummary)
def post_scan_result(
    payload: ScanResult,
    session: Session = Depends(get_session),
) -> ScanResultSummary:
    """Agent callback after one Gmail poll. Idempotent; advances the cursor."""
    return intake_service.ingest_scan_result(session, payload)


@router.get("/leads", response_model=list[IncomingLeadRead])
def list_intake_leads(
    status: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[IncomingLeadRead]:
    leads = intake_service.list_leads(session, status)
    return [intake_service.lead_read(lead) for lead in leads]


@router.post("/leads/{lead_id}/accept", response_model=IncomingLeadRead)
def accept_intake_lead(
    lead_id: str,
    payload: LeadAccept,
    session: Session = Depends(get_session),
) -> IncomingLeadRead:
    lead = session.get(IncomingLead, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return intake_service.lead_read(
        intake_service.accept_lead(session, lead, payload)
    )


@router.post("/leads/{lead_id}/dismiss", response_model=IncomingLeadRead)
def dismiss_intake_lead(
    lead_id: str,
    session: Session = Depends(get_session),
) -> IncomingLeadRead:
    lead = session.get(IncomingLead, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return intake_service.lead_read(intake_service.dismiss_lead(session, lead))
