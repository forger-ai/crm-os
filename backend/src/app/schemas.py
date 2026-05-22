from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


def _to_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)

ActivityKind = Literal["call", "email", "meeting", "task"]
DealStatus = Literal["open", "won", "lost"]
CustomFieldEntity = Literal["contact", "organization", "deal"]
CustomFieldType = Literal["text", "number", "date", "select", "bool"]


# ── Organizations ───────────────────────────────────────────────────────────


class OrganizationWrite(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    domain: str | None = Field(default=None, max_length=200)
    industry: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=400)
    phone: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=400)
    owner: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class OrganizationPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    domain: str | None = Field(default=None, max_length=200)
    industry: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=400)
    phone: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=400)
    owner: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class OrganizationSummary(BaseModel):
    id: str
    name: str
    domain: str | None
    industry: str | None
    owner: str | None
    contacts_count: int
    open_deals_count: int
    open_deals_value: dict[str, int]  # currency → cents


class OrganizationRead(BaseModel):
    id: str
    name: str
    domain: str | None
    industry: str | None
    website: str | None
    phone: str | None
    address: str | None
    owner: str | None
    description: str | None
    created_at: datetime
    updated_at: datetime
    contacts: list[ContactSummary]
    open_deals: list[DealSummary]
    custom_fields: list[CustomFieldValueRead]


# ── Contacts ────────────────────────────────────────────────────────────────


class ContactWrite(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=80)
    job_title: str | None = Field(default=None, max_length=160)
    owner: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class ContactPatch(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=80)
    job_title: str | None = Field(default=None, max_length=160)
    owner: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class ContactSummary(BaseModel):
    id: str
    first_name: str
    last_name: str | None
    email: str | None
    job_title: str | None
    owner: str | None
    organizations: list[ContactOrganizationLink]


class ContactRead(BaseModel):
    id: str
    first_name: str
    last_name: str | None
    email: str | None
    phone: str | None
    job_title: str | None
    owner: str | None
    description: str | None
    created_at: datetime
    updated_at: datetime
    organizations: list[ContactOrganizationLink]
    open_deals: list[DealSummary]
    custom_fields: list[CustomFieldValueRead]


class ContactOrganizationLink(BaseModel):
    organization_id: str
    organization_name: str
    role: str | None
    is_primary: bool


class ContactOrganizationLinkWrite(BaseModel):
    contact_id: str
    role: str | None = Field(default=None, max_length=160)
    is_primary: bool = False


# ── Pipelines & stages ──────────────────────────────────────────────────────


class PipelineStageWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    probability_default: int = Field(default=0, ge=0, le=100)
    is_won: bool = False
    is_lost: bool = False
    color: str = Field(default="#5B7FB7", max_length=32)


class PipelineStagePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    probability_default: int | None = Field(default=None, ge=0, le=100)
    is_won: bool | None = None
    is_lost: bool | None = None
    color: str | None = Field(default=None, max_length=32)


class PipelineStageRead(BaseModel):
    id: str
    pipeline_id: str
    name: str
    position: int
    probability_default: int
    is_won: bool
    is_lost: bool
    color: str


class PipelineWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_default: bool = False


class PipelinePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_default: bool | None = None
    archived: bool | None = None


class PipelineRead(BaseModel):
    id: str
    name: str
    is_default: bool
    archived: bool
    position: int
    stages: list[PipelineStageRead]


class StageReorder(BaseModel):
    stage_ids: list[str]


# ── Deals ───────────────────────────────────────────────────────────────────


class DealWrite(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    organization_id: str | None = None
    primary_contact_id: str | None = None
    pipeline_id: str
    stage_id: str
    owner: str | None = Field(default=None, max_length=120)
    amount_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="CLP", max_length=8)
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: datetime | None = None
    description: str | None = Field(default=None, max_length=2000)

    _normalize_close = field_validator("expected_close_date")(
        lambda cls, v: _to_naive_utc(v)
    )


class DealPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    organization_id: str | None = None
    primary_contact_id: str | None = None
    owner: str | None = Field(default=None, max_length=120)
    amount_cents: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: datetime | None = None
    description: str | None = Field(default=None, max_length=2000)

    _normalize_close = field_validator("expected_close_date")(
        lambda cls, v: _to_naive_utc(v)
    )


class DealMove(BaseModel):
    stage_id: str
    note: str | None = Field(default=None, max_length=400)


class DealLose(BaseModel):
    reason: str = Field(min_length=1, max_length=400)
    note: str | None = Field(default=None, max_length=400)


class DealWin(BaseModel):
    note: str | None = Field(default=None, max_length=400)


class DealSummary(BaseModel):
    id: str
    title: str
    pipeline_id: str
    stage_id: str
    stage_name: str
    organization_id: str | None
    organization_name: str | None
    primary_contact_id: str | None
    primary_contact_name: str | None
    owner: str | None
    amount_cents: int
    currency: str
    probability: int
    expected_close_date: datetime | None
    status: DealStatus
    updated_at: datetime


class DealStageHistoryRead(BaseModel):
    id: str
    from_stage_id: str | None
    from_stage_name: str | None
    to_stage_id: str
    to_stage_name: str
    note: str | None
    changed_at: datetime


class DealRead(BaseModel):
    id: str
    title: str
    pipeline_id: str
    stage_id: str
    stage_name: str
    organization_id: str | None
    organization_name: str | None
    primary_contact_id: str | None
    primary_contact_name: str | None
    owner: str | None
    amount_cents: int
    currency: str
    probability: int
    expected_close_date: datetime | None
    status: DealStatus
    won_at: datetime | None
    lost_at: datetime | None
    lost_reason: str | None
    description: str | None
    created_at: datetime
    updated_at: datetime
    stage_history: list[DealStageHistoryRead]
    activities: list[ActivityRead]
    notes: list[NoteRead]
    custom_fields: list[CustomFieldValueRead]


# ── Activities ──────────────────────────────────────────────────────────────


class ActivityWrite(BaseModel):
    kind: ActivityKind
    subject: str = Field(min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20000)
    due_at: datetime | None = None
    deal_id: str | None = None
    contact_id: str | None = None
    organization_id: str | None = None
    owner: str | None = Field(default=None, max_length=120)
    pending_send: bool = False
    to_email: str | None = Field(default=None, max_length=2000)

    _normalize_due = field_validator("due_at")(lambda cls, v: _to_naive_utc(v))


class ActivityPatch(BaseModel):
    kind: ActivityKind | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20000)
    due_at: datetime | None = None
    deal_id: str | None = None
    contact_id: str | None = None
    organization_id: str | None = None
    owner: str | None = Field(default=None, max_length=120)
    pending_send: bool | None = None
    to_email: str | None = Field(default=None, max_length=2000)

    _normalize_due = field_validator("due_at")(lambda cls, v: _to_naive_utc(v))


class ActivityRead(BaseModel):
    id: str
    kind: ActivityKind
    subject: str
    body: str | None
    due_at: datetime | None
    completed_at: datetime | None
    deal_id: str | None
    contact_id: str | None
    organization_id: str | None
    owner: str | None
    external_provider: str | None
    external_message_id: str | None
    external_thread_id: str | None
    from_email: str | None
    to_email: str | None
    pending_send: bool
    created_at: datetime
    updated_at: datetime


# Used by the agent (running in Forger Desktop) to ingest emails fetched via
# the Gmail official tool. Idempotent on (external_provider, external_message_id):
# re-importing the same external email returns the existing row unchanged.
class ActivityExternalImport(BaseModel):
    external_provider: Literal["gmail"]
    external_message_id: str = Field(min_length=1, max_length=300)
    external_thread_id: str | None = Field(default=None, max_length=300)
    kind: Literal["email"] = "email"
    subject: str = Field(min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20000)
    from_email: str | None = Field(default=None, max_length=200)
    to_email: str | None = Field(default=None, max_length=2000)
    completed_at: datetime
    owner: str | None = Field(default=None, max_length=120)
    # Anchor resolution. The agent provides what it knows; the service resolves
    # missing references by matching match_by_emails against existing contacts.
    deal_id: str | None = None
    contact_id: str | None = None
    organization_id: str | None = None
    match_by_emails: list[str] = Field(default_factory=list, max_length=20)

    _normalize_completed = field_validator("completed_at")(
        lambda cls, v: _to_naive_utc(v)
    )


class EmailSyncStatus(BaseModel):
    provider: Literal["gmail"]
    last_synced_at: datetime | None
    total_synced: int
    last_24h: int
    pending_send_count: int


# ── Notes ───────────────────────────────────────────────────────────────────


class NoteWrite(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    deal_id: str | None = None
    contact_id: str | None = None
    organization_id: str | None = None
    author: str | None = Field(default=None, max_length=120)
    pinned: bool = False


class NotePatch(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=8000)
    pinned: bool | None = None


class NoteRead(BaseModel):
    id: str
    body: str
    deal_id: str | None
    contact_id: str | None
    organization_id: str | None
    author: str | None
    pinned: bool
    created_at: datetime
    updated_at: datetime


# ── Custom fields ───────────────────────────────────────────────────────────


class CustomFieldDefWrite(BaseModel):
    entity: CustomFieldEntity
    key: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)
    type: CustomFieldType
    options: list[str] | None = None


class CustomFieldDefPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=160)
    options: list[str] | None = None
    archived: bool | None = None
    position: int | None = Field(default=None, ge=0)


class CustomFieldDefRead(BaseModel):
    id: str
    entity: CustomFieldEntity
    key: str
    label: str
    type: CustomFieldType
    options: list[str] | None
    position: int
    archived: bool


class CustomFieldValueWrite(BaseModel):
    field_id: str
    value: Any | None = None


class CustomFieldValueRead(BaseModel):
    field_id: str
    key: str
    label: str
    type: CustomFieldType
    value: Any | None


# ── Imports ─────────────────────────────────────────────────────────────────


class ImportRunRead(BaseModel):
    id: str
    source: Literal["contacts", "organizations"]
    filename: str | None
    rows_total: int
    rows_imported: int
    rows_skipped: int
    rows_failed: int
    dry_run: bool
    created_at: datetime


class ImportRunDetail(ImportRunRead):
    errors: list[dict[str, Any]]


# ── Field value registry ────────────────────────────────────────────────────


class FieldValueRead(BaseModel):
    scope: str
    value: str
    usage_count: int
    last_used_at: datetime


# ── Reports ─────────────────────────────────────────────────────────────────


class PipelineValueByStage(BaseModel):
    stage_id: str
    stage_name: str
    deals_count: int
    by_currency: dict[str, int]  # currency → sum of amount_cents


class WonLostByMonth(BaseModel):
    month: str  # "YYYY-MM"
    won_count: int
    lost_count: int
    won_by_currency: dict[str, int]
    lost_by_currency: dict[str, int]


class StageConversionPoint(BaseModel):
    stage_id: str
    stage_name: str
    entered: int
    moved_forward: int
    conversion_rate: float


class ActivitiesOverview(BaseModel):
    overdue: int
    due_today: int
    due_this_week: int
    completed_last_30_days: int
    upcoming: list[ActivityRead]


class WeeklySummary(BaseModel):
    pipeline_value: dict[str, int]
    deals_open: int
    deals_won_this_week: int
    deals_lost_this_week: int
    activities: ActivitiesOverview
    stale_deals: list[DealSummary]


# ── Search ──────────────────────────────────────────────────────────────────


class SearchHit(BaseModel):
    entity: Literal["organization", "contact", "deal"]
    id: str
    label: str
    sublabel: str | None


class SearchResults(BaseModel):
    organizations: list[SearchHit]
    contacts: list[SearchHit]
    deals: list[SearchHit]


# ── Products ────────────────────────────────────────────────────────────────


class ProductWrite(BaseModel):
    sku: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=120)
    default_unit_price_cents: int = Field(default=0, ge=0)
    default_currency: str = Field(default="CLP", max_length=8)


class ProductPatch(BaseModel):
    sku: str | None = Field(default=None, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=120)
    default_unit_price_cents: int | None = Field(default=None, ge=0)
    default_currency: str | None = Field(default=None, max_length=8)
    archived: bool | None = None


class ProductRead(BaseModel):
    id: str
    sku: str | None
    name: str
    description: str | None
    category: str | None
    default_unit_price_cents: int
    default_currency: str
    archived: bool
    created_at: datetime
    updated_at: datetime


# ── Quote line items ────────────────────────────────────────────────────────


class QuoteLineWrite(BaseModel):
    product_id: str | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    quantity: float = Field(default=1.0, gt=0)
    unit_price_cents: int = Field(default=0, ge=0)
    discount_pct: float = Field(default=0.0, ge=0, le=100)


class QuoteLinePatch(BaseModel):
    product_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    quantity: float | None = Field(default=None, gt=0)
    unit_price_cents: int | None = Field(default=None, ge=0)
    discount_pct: float | None = Field(default=None, ge=0, le=100)


class QuoteLineRead(BaseModel):
    id: str
    quote_id: str
    position: int
    product_id: str | None
    name: str
    description: str | None
    quantity: float
    unit_price_cents: int
    discount_pct: float
    line_total_cents: int


# ── Quotes ──────────────────────────────────────────────────────────────────

QuoteStatus = Literal["draft", "sent", "accepted", "rejected", "expired"]


class QuoteWrite(BaseModel):
    deal_id: str
    title: str = Field(min_length=1, max_length=200)
    currency: str | None = Field(default=None, max_length=8)
    tax_rate: float = Field(default=19.0, ge=0, le=100)
    valid_until: datetime | None = None
    notes: str | None = Field(default=None, max_length=4000)
    lines: list[QuoteLineWrite] = Field(default_factory=list)

    _normalize_valid = field_validator("valid_until")(
        lambda cls, v: _to_naive_utc(v)
    )


class QuotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    currency: str | None = Field(default=None, max_length=8)
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    valid_until: datetime | None = None
    notes: str | None = Field(default=None, max_length=4000)

    _normalize_valid = field_validator("valid_until")(
        lambda cls, v: _to_naive_utc(v)
    )


class QuoteSummary(BaseModel):
    id: str
    deal_id: str
    number: str
    title: str
    status: QuoteStatus
    currency: str
    total_cents: int
    valid_until: datetime | None
    sent_at: datetime | None
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime


class QuoteRead(QuoteSummary):
    subtotal_cents: int
    tax_rate: float
    tax_cents: int
    notes: str | None
    lines: list[QuoteLineRead]


# ── Lead scoring ────────────────────────────────────────────────────────────


class LeadScoreFactor(BaseModel):
    key: str
    label: str
    contribution: int  # contribution to the 0-100 score (rounded)
    detail: str  # human-readable explanation of the value


class LeadScoreRead(BaseModel):
    deal_id: str
    score: int  # 0-100
    band: Literal["hot", "warm", "cold"]
    factors: list[LeadScoreFactor]
    computed_at: datetime


class LeadScoreEntry(BaseModel):
    """Row used in the dashboard hot/cold lists."""

    deal_id: str
    deal_title: str
    score: int
    band: Literal["hot", "warm", "cold"]
    stage_name: str
    amount_cents: int
    currency: str
    owner: str | None


class LeadScoreReport(BaseModel):
    hot: list[LeadScoreEntry]
    cold: list[LeadScoreEntry]


# ── Lead intake (Gmail polling) ─────────────────────────────────────────────

IntakeMode = Literal["review", "auto"]
IncomingLeadStatus = Literal["pending", "accepted", "dismissed"]


class IntakeConfigRead(BaseModel):
    enabled: bool
    mode: IntakeMode
    poll_interval_minutes: int
    last_polled_at: datetime | None
    since_iso: datetime  # window start the next Gmail poll should use
    pending_count: int


class IntakeConfigUpdate(BaseModel):
    enabled: bool | None = None
    mode: IntakeMode | None = None
    poll_interval_minutes: int | None = Field(default=None, ge=1, le=180)


# One lead the agent detected in Gmail. Posted in a batch to /api/intake/scan-result.
class LeadCandidate(BaseModel):
    external_message_id: str = Field(min_length=1, max_length=300)
    external_thread_id: str | None = Field(default=None, max_length=300)
    from_email: str | None = Field(default=None, max_length=200)
    from_name: str | None = Field(default=None, max_length=200)
    subject: str | None = Field(default=None, max_length=300)
    body: str | None = Field(default=None, max_length=20000)
    received_at: datetime | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)
    reason: str | None = Field(default=None, max_length=600)
    suggested_first_name: str | None = Field(default=None, max_length=120)
    suggested_last_name: str | None = Field(default=None, max_length=120)
    suggested_org_name: str | None = Field(default=None, max_length=200)
    suggested_phone: str | None = Field(default=None, max_length=80)

    _normalize_received = field_validator("received_at")(
        lambda cls, v: _to_naive_utc(v)
    )


# Agent callback after one Gmail poll. Idempotent per lead; advances the cursor.
class ScanResult(BaseModel):
    polled_at: datetime
    leads: list[LeadCandidate] = Field(default_factory=list, max_length=200)

    _normalize_polled = field_validator("polled_at")(
        lambda cls, v: _to_naive_utc(v)
    )


class ScanResultSummary(BaseModel):
    created: int
    duplicates: int
    skipped_known: int
    promoted: int


class IncomingLeadRead(BaseModel):
    id: str
    external_provider: str
    external_message_id: str
    external_thread_id: str | None
    from_email: str | None
    from_name: str | None
    subject: str | None
    body: str | None
    received_at: datetime | None
    confidence: float
    reason: str | None
    suggested_first_name: str | None
    suggested_last_name: str | None
    suggested_org_name: str | None
    suggested_phone: str | None
    status: IncomingLeadStatus
    created_contact_id: str | None
    created_deal_id: str | None
    created_at: datetime
    updated_at: datetime


# Optional edits applied when accepting a pending lead from the review queue.
class LeadAccept(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=80)
    organization_name: str | None = Field(default=None, max_length=200)


# resolve forward references for Pydantic v2
OrganizationRead.model_rebuild()
ContactRead.model_rebuild()
ContactSummary.model_rebuild()
DealRead.model_rebuild()
