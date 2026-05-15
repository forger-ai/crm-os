from __future__ import annotations

import csv
import io
import json
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import Contact, ImportRun, Organization
from app.schemas import ImportRunDetail, ImportRunRead
from app.services.field_values import record_values

router = APIRouter(prefix="/api/imports", tags=["imports"])

ALLOWED_ORG_FIELDS = {
    "name",
    "domain",
    "industry",
    "website",
    "phone",
    "address",
    "owner",
    "description",
}
ALLOWED_CONTACT_FIELDS = {
    "first_name",
    "last_name",
    "email",
    "phone",
    "job_title",
    "owner",
    "description",
}

MAX_BYTES = 10 * 1024 * 1024  # 10 MB cap; CSVs over this size should be split


def _parse_csv(file_bytes: bytes) -> list[dict[str, str]]:
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict[str, str]] = []
    for raw in reader:
        cleaned: dict[str, str] = {}
        for key, value in raw.items():
            if key is None:
                continue
            cleaned[key.strip().lower().replace(" ", "_")] = (value or "").strip()
        rows.append(cleaned)
    return rows


def _record_run(
    session: Session,
    *,
    source: Literal["contacts", "organizations"],
    filename: str | None,
    rows_total: int,
    rows_imported: int,
    rows_skipped: int,
    rows_failed: int,
    errors: list[dict[str, object]],
    dry_run: bool,
) -> ImportRun:
    run = ImportRun(
        source=source,
        filename=filename,
        rows_total=rows_total,
        rows_imported=rows_imported,
        rows_skipped=rows_skipped,
        rows_failed=rows_failed,
        errors_json=json.dumps(errors) if errors else None,
        dry_run=dry_run,
    )
    session.add(run)
    return run


@router.post("/organizations", response_model=ImportRunDetail)
async def import_organizations(
    file: UploadFile = File(...),
    dry_run: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> ImportRunDetail:
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    rows = _parse_csv(raw)
    errors: list[dict[str, object]] = []
    imported = 0
    skipped = 0
    failed = 0

    seen_names: set[str] = set()
    for index, row in enumerate(rows, start=2):  # start=2 → first data row in CSV
        name = (row.get("name") or "").strip()
        if not name:
            errors.append({"row": index, "reason": "missing name"})
            failed += 1
            continue
        key = name.lower()
        if key in seen_names:
            errors.append({"row": index, "reason": "duplicate name in file"})
            skipped += 1
            continue
        existing = session.exec(
            select(Organization).where(Organization.name == name)
        ).first()
        if existing is not None:
            errors.append(
                {"row": index, "reason": "name already exists", "name": name}
            )
            skipped += 1
            continue
        seen_names.add(key)
        if not dry_run:
            data = {
                key: value
                for key, value in row.items()
                if key in ALLOWED_ORG_FIELDS and value
            }
            if "name" not in data:
                data["name"] = name
            org = Organization(**data)
            session.add(org)
            record_values(
                session,
                {
                    "organization.industry": data.get("industry"),
                    "organization.owner": data.get("owner"),
                    "organization.address": data.get("address"),
                },
            )
        imported += 1

    run = _record_run(
        session,
        source="organizations",
        filename=file.filename,
        rows_total=len(rows),
        rows_imported=imported,
        rows_skipped=skipped,
        rows_failed=failed,
        errors=errors,
        dry_run=dry_run,
    )
    session.commit()
    session.refresh(run)
    return ImportRunDetail(
        id=run.id,
        source="organizations",
        filename=run.filename,
        rows_total=run.rows_total,
        rows_imported=run.rows_imported,
        rows_skipped=run.rows_skipped,
        rows_failed=run.rows_failed,
        dry_run=run.dry_run,
        created_at=run.created_at,
        errors=errors,
    )


@router.post("/contacts", response_model=ImportRunDetail)
async def import_contacts(
    file: UploadFile = File(...),
    dry_run: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> ImportRunDetail:
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    rows = _parse_csv(raw)
    errors: list[dict[str, object]] = []
    imported = 0
    skipped = 0
    failed = 0

    seen_emails: set[str] = set()
    for index, row in enumerate(rows, start=2):
        first = (row.get("first_name") or "").strip()
        if not first:
            errors.append({"row": index, "reason": "missing first_name"})
            failed += 1
            continue
        email = (row.get("email") or "").strip().lower() or None
        if email and email in seen_emails:
            errors.append({"row": index, "reason": "duplicate email in file", "email": email})
            skipped += 1
            continue
        if email:
            existing = session.exec(
                select(Contact).where(Contact.email == email)
            ).first()
            if existing is not None:
                errors.append(
                    {"row": index, "reason": "email already exists", "email": email}
                )
                skipped += 1
                continue
            seen_emails.add(email)
        if not dry_run:
            data = {
                key: value
                for key, value in row.items()
                if key in ALLOWED_CONTACT_FIELDS and value
            }
            if "first_name" not in data:
                data["first_name"] = first
            if email:
                data["email"] = email
            contact = Contact(**data)
            session.add(contact)
            record_values(
                session,
                {
                    "contact.job_title": data.get("job_title"),
                    "contact.owner": data.get("owner"),
                },
            )
        imported += 1

    run = _record_run(
        session,
        source="contacts",
        filename=file.filename,
        rows_total=len(rows),
        rows_imported=imported,
        rows_skipped=skipped,
        rows_failed=failed,
        errors=errors,
        dry_run=dry_run,
    )
    session.commit()
    session.refresh(run)
    return ImportRunDetail(
        id=run.id,
        source="contacts",
        filename=run.filename,
        rows_total=run.rows_total,
        rows_imported=run.rows_imported,
        rows_skipped=run.rows_skipped,
        rows_failed=run.rows_failed,
        dry_run=run.dry_run,
        created_at=run.created_at,
        errors=errors,
    )


@router.get("", response_model=list[ImportRunRead])
def list_imports(session: Session = Depends(get_session)) -> list[ImportRunRead]:
    rows = list(
        session.exec(select(ImportRun).order_by(ImportRun.created_at.desc())).all()  # type: ignore[attr-defined]
    )
    return [
        ImportRunRead(
            id=r.id,
            source=r.source,  # type: ignore[arg-type]
            filename=r.filename,
            rows_total=r.rows_total,
            rows_imported=r.rows_imported,
            rows_skipped=r.rows_skipped,
            rows_failed=r.rows_failed,
            dry_run=r.dry_run,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/{run_id}", response_model=ImportRunDetail)
def get_import(run_id: str, session: Session = Depends(get_session)) -> ImportRunDetail:
    run = session.get(ImportRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Import run not found")
    errors = json.loads(run.errors_json) if run.errors_json else []
    return ImportRunDetail(
        id=run.id,
        source=run.source,  # type: ignore[arg-type]
        filename=run.filename,
        rows_total=run.rows_total,
        rows_imported=run.rows_imported,
        rows_skipped=run.rows_skipped,
        rows_failed=run.rows_failed,
        dry_run=run.dry_run,
        created_at=run.created_at,
        errors=errors,
    )
