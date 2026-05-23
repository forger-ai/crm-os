from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlmodel import Field, SQLModel, UniqueConstraint


def utcnow() -> datetime:
    """Naive UTC. SQLite stores datetimes without tzinfo, so we keep the whole
    app on naive UTC to allow direct comparisons between fresh values and rows
    read back from the database.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def to_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def new_id() -> str:
    return str(uuid4())


# ── Organizations & contacts ────────────────────────────────────────────────


class Organization(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    name: str = Field(index=True, min_length=1, max_length=200)
    domain: str | None = Field(default=None, index=True, max_length=200)
    industry: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=400)
    phone: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=400)
    owner: str | None = Field(default=None, index=True, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Contact(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, index=True, max_length=200)
    phone: str | None = Field(default=None, max_length=80)
    job_title: str | None = Field(default=None, max_length=160)
    owner: str | None = Field(default=None, index=True, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ContactOrganization(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("contact_id", "organization_id", name="uq_contact_org_pair"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    contact_id: str = Field(foreign_key="contact.id", index=True)
    organization_id: str = Field(foreign_key="organization.id", index=True)
    role: str | None = Field(default=None, max_length=160)
    is_primary: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


# ── Pipelines & stages ──────────────────────────────────────────────────────


class Pipeline(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    name: str = Field(index=True, min_length=1, max_length=120)
    is_default: bool = Field(default=False, index=True)
    archived: bool = Field(default=False, index=True)
    position: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PipelineStage(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    pipeline_id: str = Field(foreign_key="pipeline.id", index=True)
    name: str = Field(min_length=1, max_length=120)
    position: int = Field(default=0, ge=0)
    probability_default: int = Field(default=0, ge=0, le=100)
    is_won: bool = Field(default=False)
    is_lost: bool = Field(default=False)
    color: str = Field(default="#5B7FB7", max_length=32)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ── Deals ───────────────────────────────────────────────────────────────────


class Deal(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    title: str = Field(index=True, min_length=1, max_length=200)
    organization_id: str | None = Field(
        default=None, foreign_key="organization.id", index=True
    )
    primary_contact_id: str | None = Field(
        default=None, foreign_key="contact.id", index=True
    )
    pipeline_id: str = Field(foreign_key="pipeline.id", index=True)
    stage_id: str = Field(foreign_key="pipelinestage.id", index=True)
    owner: str | None = Field(default=None, index=True, max_length=120)
    amount_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="CLP", max_length=8, index=True)
    probability: int = Field(default=0, ge=0, le=100)
    expected_close_date: datetime | None = Field(default=None)
    status: str = Field(default="open", index=True, max_length=16)  # open | won | lost
    won_at: datetime | None = Field(default=None)
    lost_at: datetime | None = Field(default=None)
    lost_reason: str | None = Field(default=None, max_length=400)
    description: str | None = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class DealStageHistory(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    deal_id: str = Field(foreign_key="deal.id", index=True)
    from_stage_id: str | None = Field(default=None, foreign_key="pipelinestage.id")
    to_stage_id: str = Field(foreign_key="pipelinestage.id")
    note: str | None = Field(default=None, max_length=400)
    changed_at: datetime = Field(default_factory=utcnow, index=True)


# ── Activities & notes ──────────────────────────────────────────────────────


class Activity(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "external_provider",
            "external_message_id",
            name="uq_activity_external_provider_message",
        ),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    kind: str = Field(index=True, max_length=16)  # call | email | meeting | task
    subject: str = Field(min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20000)
    due_at: datetime | None = Field(default=None, index=True)
    completed_at: datetime | None = Field(default=None, index=True)
    deal_id: str | None = Field(default=None, foreign_key="deal.id", index=True)
    contact_id: str | None = Field(default=None, foreign_key="contact.id", index=True)
    organization_id: str | None = Field(
        default=None, foreign_key="organization.id", index=True
    )
    owner: str | None = Field(default=None, index=True, max_length=120)
    # External provider integration (Gmail, Outlook in the future). Together with
    # external_message_id forms a unique pair so re-importing the same email is a
    # no-op. Only kind=email currently uses these.
    external_provider: str | None = Field(default=None, index=True, max_length=32)
    external_message_id: str | None = Field(default=None, max_length=300)
    external_thread_id: str | None = Field(default=None, index=True, max_length=300)
    from_email: str | None = Field(default=None, index=True, max_length=200)
    to_email: str | None = Field(default=None, max_length=2000)
    pending_send: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Note(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    body: str = Field(min_length=1, max_length=8000)
    deal_id: str | None = Field(default=None, foreign_key="deal.id", index=True)
    contact_id: str | None = Field(default=None, foreign_key="contact.id", index=True)
    organization_id: str | None = Field(
        default=None, foreign_key="organization.id", index=True
    )
    author: str | None = Field(default=None, max_length=120)
    pinned: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ── Custom fields ───────────────────────────────────────────────────────────


class CustomFieldDef(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("entity", "key", name="uq_custom_field_entity_key"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    entity: str = Field(index=True, max_length=32)  # contact | organization | deal
    key: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)
    type: str = Field(max_length=16)  # text | number | date | select | bool
    options_json: str | None = Field(default=None, max_length=4000)
    position: int = Field(default=0, ge=0)
    archived: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CustomFieldValue(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "field_id", "entity_id", name="uq_custom_field_value_field_entity"
        ),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    field_id: str = Field(foreign_key="customfielddef.id", index=True)
    entity_id: str = Field(index=True, max_length=64)
    value_text: str | None = Field(default=None, max_length=4000)
    value_number: float | None = Field(default=None)
    value_date: datetime | None = Field(default=None)
    value_bool: bool | None = Field(default=None)
    updated_at: datetime = Field(default_factory=utcnow)


# ── CSV imports ─────────────────────────────────────────────────────────────


class ImportRun(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    source: str = Field(index=True, max_length=32)  # contacts | organizations
    filename: str | None = Field(default=None, max_length=400)
    rows_total: int = Field(default=0, ge=0)
    rows_imported: int = Field(default=0, ge=0)
    rows_skipped: int = Field(default=0, ge=0)
    rows_failed: int = Field(default=0, ge=0)
    errors_json: str | None = Field(default=None)
    dry_run: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow, index=True)


# ── Free-text value registry (autocomplete) ─────────────────────────────────


class FieldValue(SQLModel, table=True):
    """Records every free-text value entered in tracked open fields.

    Scope is the dotted entity.field name (e.g. "deal.owner",
    "organization.industry"). Lookups are case-insensitive via value_lower.
    """

    __table_args__ = (
        UniqueConstraint("scope", "value_lower", name="uq_field_value_scope_value"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    scope: str = Field(index=True, max_length=64)
    value: str = Field(max_length=400)
    value_lower: str = Field(index=True, max_length=400)
    usage_count: int = Field(default=1, ge=0)
    last_used_at: datetime = Field(default_factory=utcnow, index=True)
    created_at: datetime = Field(default_factory=utcnow)


# ── Product catalog ─────────────────────────────────────────────────────────


class Product(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("sku", name="uq_product_sku"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    sku: str | None = Field(default=None, index=True, max_length=80)
    name: str = Field(index=True, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, index=True, max_length=120)
    default_unit_price_cents: int = Field(default=0, ge=0)
    default_currency: str = Field(default="CLP", max_length=8)
    archived: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ── Quotes & line items ─────────────────────────────────────────────────────


class Quote(SQLModel, table=True):
    """Cotización generada para un deal.

    Numeración Q-YYYY-NNN gestionada por una secuencia anual interna
    (services.quotes.next_quote_number). Totales (subtotal, tax, total) son
    derivados desde las líneas; las rutas NO aceptan estos campos en el input.
    Status es una máquina de estados: draft → sent → accepted | rejected,
    cualquiera → expired (lazy o cron). Marcar accepted NO mueve el deal a
    "Cerrado Ganado" automáticamente — eso queda a decisión del usuario.
    """

    __table_args__ = (
        UniqueConstraint("number", name="uq_quote_number"),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    deal_id: str = Field(foreign_key="deal.id", index=True)
    number: str = Field(index=True, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    status: str = Field(
        default="draft", index=True, max_length=16
    )  # draft | sent | accepted | rejected | expired
    currency: str = Field(default="CLP", max_length=8)
    subtotal_cents: int = Field(default=0, ge=0)
    tax_rate: float = Field(default=19.0, ge=0, le=100)  # percent, IVA default
    tax_cents: int = Field(default=0, ge=0)
    total_cents: int = Field(default=0, ge=0)
    valid_until: datetime | None = Field(default=None)
    notes: str | None = Field(default=None, max_length=4000)
    sent_at: datetime | None = Field(default=None)
    decided_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class QuoteLine(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    quote_id: str = Field(foreign_key="quote.id", index=True)
    position: int = Field(default=0, ge=0)
    product_id: str | None = Field(
        default=None, foreign_key="product.id", index=True
    )
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    quantity: float = Field(default=1.0, gt=0)
    unit_price_cents: int = Field(default=0, ge=0)
    discount_pct: float = Field(default=0.0, ge=0, le=100)
    line_total_cents: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class QuoteNumberSequence(SQLModel, table=True):
    """Counter por año para numerar cotizaciones Q-YYYY-NNN.

    Se incrementa con UPDATE atómico desde services.quotes.next_quote_number.
    """

    year: int = Field(primary_key=True)
    last_number: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=utcnow)


# ── Lead intake (Gmail polling) ─────────────────────────────────────────────


class IntakeConfig(SQLModel, table=True):
    """Single-row configuration for the Gmail lead polling.

    The frontend polls Gmail every few minutes while the app is open; the
    backend never reaches Gmail itself. `last_polled_at` is the cursor: the
    agent only scans messages newer than it.
    """

    id: str = Field(default="default", primary_key=True)
    enabled: bool = Field(default=False)  # opt-in: each poll spends Codex tokens
    mode: str = Field(default="review", max_length=16)  # review | auto
    poll_interval_minutes: int = Field(default=5, ge=1, le=180)
    last_polled_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class IncomingLead(SQLModel, table=True):
    """A Gmail message the agent classified as a sales lead.

    Idempotent on (external_provider, external_message_id) so the agent can
    re-report the same message across overlapping poll windows safely.
    """

    __table_args__ = (
        UniqueConstraint(
            "external_provider",
            "external_message_id",
            name="uq_incoming_lead_provider_message",
        ),
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    external_provider: str = Field(default="gmail", index=True, max_length=32)
    external_message_id: str = Field(max_length=300)
    external_thread_id: str | None = Field(default=None, max_length=300)
    from_email: str | None = Field(default=None, index=True, max_length=200)
    from_name: str | None = Field(default=None, max_length=200)
    subject: str | None = Field(default=None, max_length=300)
    body: str | None = Field(default=None, max_length=20000)
    received_at: datetime | None = Field(default=None, index=True)
    confidence: float = Field(default=0.0, ge=0, le=1)
    reason: str | None = Field(default=None, max_length=600)
    # Lead fields the agent extracted from the email body / signature.
    suggested_first_name: str | None = Field(default=None, max_length=120)
    suggested_last_name: str | None = Field(default=None, max_length=120)
    suggested_org_name: str | None = Field(default=None, max_length=200)
    suggested_phone: str | None = Field(default=None, max_length=80)
    status: str = Field(
        default="pending", index=True, max_length=16
    )  # pending | accepted | dismissed
    created_contact_id: str | None = Field(
        default=None, foreign_key="contact.id"
    )
    created_deal_id: str | None = Field(default=None, foreign_key="deal.id")
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)
