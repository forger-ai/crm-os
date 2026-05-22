"""App-specific database extension for CRM OS.

Registers SQLModel metadata, runs the shared init_db(), and seeds the default
sales pipeline on first run. Idempotent: safe to call on every startup.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app import models as _models  # noqa: F401 - register SQLModel metadata
from app.database import engine, init_db
from app.models import FieldValue, Pipeline, PipelineStage

DEFAULT_PIPELINE_NAME = "Ventas"

DEFAULT_STAGES: list[dict] = [
    {"name": "Lead", "probability_default": 10, "color": "#9CA3AF"},
    {"name": "Calificado", "probability_default": 30, "color": "#60A5FA"},
    {"name": "Propuesta", "probability_default": 50, "color": "#818CF8"},
    {"name": "Negociacion", "probability_default": 70, "color": "#A78BFA"},
    {
        "name": "Cerrado Ganado",
        "probability_default": 100,
        "color": "#34D399",
        "is_won": True,
    },
    {
        "name": "Cerrado Perdido",
        "probability_default": 0,
        "color": "#F87171",
        "is_lost": True,
    },
]


def _seed_default_pipeline(session: Session) -> None:
    existing = session.exec(select(Pipeline).limit(1)).first()
    if existing is not None:
        return

    pipeline = Pipeline(name=DEFAULT_PIPELINE_NAME, is_default=True, position=0)
    session.add(pipeline)
    session.flush()

    for index, stage in enumerate(DEFAULT_STAGES):
        session.add(
            PipelineStage(
                pipeline_id=pipeline.id,
                name=stage["name"],
                position=index,
                probability_default=stage["probability_default"],
                color=stage.get("color", "#5B7FB7"),
                is_won=bool(stage.get("is_won", False)),
                is_lost=bool(stage.get("is_lost", False)),
            )
        )

    session.commit()


DEFAULT_CURRENCIES = ["CLP", "USD", "EUR", "UF"]


def _seed_default_currencies(session: Session) -> None:
    for code in DEFAULT_CURRENCIES:
        existing = session.exec(
            select(FieldValue).where(
                FieldValue.scope == "deal.currency",
                FieldValue.value_lower == code.lower(),
            )
        ).first()
        if existing is None:
            session.add(
                FieldValue(
                    scope="deal.currency",
                    value=code,
                    value_lower=code.lower(),
                    usage_count=0,
                )
            )
    session.commit()


def _migrate_activity_external_columns() -> None:
    """v0.2 migration: add Gmail integration columns to existing DBs.

    Idempotent. SQLite ALTER TABLE ADD COLUMN does not support IF NOT EXISTS,
    so we inspect the live schema first and only add what is missing.
    """
    if not str(engine.url).startswith("sqlite"):
        return

    new_columns: list[tuple[str, str]] = [
        ("external_provider", "VARCHAR(32)"),
        ("external_message_id", "VARCHAR(300)"),
        ("external_thread_id", "VARCHAR(300)"),
        ("from_email", "VARCHAR(200)"),
        ("to_email", "VARCHAR(2000)"),
        ("pending_send", "INTEGER NOT NULL DEFAULT 0"),
    ]

    with engine.connect() as conn:
        rows = conn.exec_driver_sql("PRAGMA table_info(activity)").fetchall()
        if not rows:
            return  # table not created yet; init_db() will handle it
        existing = {row[1] for row in rows}
        for name, column_type in new_columns:
            if name in existing:
                continue
            conn.exec_driver_sql(
                f"ALTER TABLE activity ADD COLUMN {name} {column_type}"
            )
        conn.commit()


def _migrate_intake_config_columns() -> None:
    """Add `poll_interval_minutes` to an `intakeconfig` table created by an
    earlier iteration of the lead-intake feature. Idempotent.
    """
    if not str(engine.url).startswith("sqlite"):
        return
    with engine.connect() as conn:
        rows = conn.exec_driver_sql("PRAGMA table_info(intakeconfig)").fetchall()
        if not rows:
            return  # table not created yet; init_db() will handle it
        existing = {row[1] for row in rows}
        if "poll_interval_minutes" not in existing:
            conn.exec_driver_sql(
                "ALTER TABLE intakeconfig ADD COLUMN "
                "poll_interval_minutes INTEGER NOT NULL DEFAULT 5"
            )
        conn.commit()


def _ensure_activity_external_index() -> None:
    """Create the unique index for (provider, message_id) if missing.

    SQLModel.metadata.create_all only adds indexes when the table is created
    fresh. For existing v0.1 DBs we add the index manually after the migration.
    """
    if not str(engine.url).startswith("sqlite"):
        return
    with engine.connect() as conn:
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_activity_external_provider "
            "ON activity (external_provider)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_activity_external_thread_id "
            "ON activity (external_thread_id)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_activity_from_email "
            "ON activity (from_email)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_activity_pending_send "
            "ON activity (pending_send)"
        )
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_external_provider_message "
            "ON activity (external_provider, external_message_id) "
            "WHERE external_provider IS NOT NULL "
            "AND external_message_id IS NOT NULL"
        )
        conn.commit()


def init_app_db() -> None:
    # Run column-level migrations BEFORE init_db so create_all does not race
    # against missing columns when SQLModel.metadata.create_all probes the
    # existing schema.
    _migrate_activity_external_columns()
    _migrate_intake_config_columns()
    init_db()
    _ensure_activity_external_index()
    with Session(engine) as session:
        _seed_default_pipeline(session)
        _seed_default_currencies(session)
