"""Heuristic lead scoring.

Computes a 0–100 score per deal from observable signals. No LLM; on-demand.

Weights (sum to 100):

  - 30  stage_probability      → mirrors stage.probability_default
  - 25  recent_engagement      → activities completed in last 30 days
  - 20  inbound_reply          → at least one inbound email in last 14 days
  - 15  freshness              → days since last activity
  - 10  amount_pressure        → log-scaled deal amount vs pipeline max

Each factor returns a contribution in [0, weight]. Factors are explainable: the
endpoint exposes both the number and a human-readable detail string so the UI
can show "why this score".

Band:
  - hot:  score ≥ 65
  - cold: score ≤ 34
  - warm: in between
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from sqlmodel import Session, func, select

from app.models import (
    Activity,
    Contact,
    Deal,
    PipelineStage,
    utcnow,
)


WEIGHTS: dict[str, int] = {
    "stage_probability": 30,
    "recent_engagement": 25,
    "inbound_reply": 20,
    "freshness": 15,
    "amount_pressure": 10,
}

assert sum(WEIGHTS.values()) == 100


@dataclass
class Factor:
    key: str
    label: str
    contribution: int
    detail: str


def _factor(
    key: str, label: str, ratio: float, detail: str
) -> Factor:
    weight = WEIGHTS[key]
    bounded = max(0.0, min(1.0, ratio))
    return Factor(
        key=key,
        label=label,
        contribution=int(round(bounded * weight)),
        detail=detail,
    )


def _stage_probability_factor(session: Session, deal: Deal) -> Factor:
    stage = session.get(PipelineStage, deal.stage_id)
    probability = stage.probability_default if stage else 0
    return _factor(
        "stage_probability",
        "Probabilidad de stage",
        probability / 100,
        f"Stage {stage.name if stage else '—'} con probabilidad default {probability}%",
    )


def _recent_engagement_factor(session: Session, deal: Deal, now: datetime) -> Factor:
    cutoff = now - timedelta(days=30)
    count = session.exec(
        select(func.count())
        .select_from(Activity)
        .where(
            Activity.deal_id == deal.id,
            Activity.completed_at.is_not(None),  # type: ignore[union-attr]
            Activity.completed_at >= cutoff,
        )
    ).first() or 0
    count = int(count or 0)
    # Saturate at 6 completed activities = full credit. Below that, linear.
    return _factor(
        "recent_engagement",
        "Engagement reciente",
        count / 6,
        f"{count} actividad(es) completada(s) en los últimos 30 días",
    )


def _inbound_reply_factor(session: Session, deal: Deal, now: datetime) -> Factor:
    cutoff = now - timedelta(days=14)

    # Collect contact emails associated with this deal (primary contact + anchor).
    contact_emails: set[str] = set()
    if deal.primary_contact_id:
        contact = session.get(Contact, deal.primary_contact_id)
        if contact and contact.email:
            contact_emails.add(contact.email.lower())

    if not contact_emails:
        return _factor(
            "inbound_reply",
            "Respuesta inbound (14 días)",
            0.0,
            "No hay contacto principal con email asociado al deal",
        )

    inbound = session.exec(
        select(func.count())
        .select_from(Activity)
        .where(
            Activity.deal_id == deal.id,
            Activity.kind == "email",
            Activity.completed_at.is_not(None),  # type: ignore[union-attr]
            Activity.completed_at >= cutoff,
            func.lower(Activity.from_email).in_(contact_emails),  # type: ignore[arg-type]
        )
    ).first() or 0
    inbound = int(inbound or 0)
    return _factor(
        "inbound_reply",
        "Respuesta inbound (14 días)",
        1.0 if inbound > 0 else 0.0,
        f"{inbound} email(s) recibido(s) del contacto en los últimos 14 días",
    )


def _freshness_factor(session: Session, deal: Deal, now: datetime) -> Factor:
    last_activity = session.exec(
        select(func.max(Activity.created_at)).where(Activity.deal_id == deal.id)
    ).first()
    if last_activity is None:
        return _factor(
            "freshness",
            "Frescura",
            0.0,
            "Sin actividades registradas",
        )
    days = max(0, (now - last_activity).days)
    if days < 7:
        ratio, label = 1.0, "muy reciente"
    elif days < 30:
        ratio, label = 0.5, "media"
    else:
        ratio, label = 0.0, "antigua"
    return _factor(
        "freshness",
        "Frescura",
        ratio,
        f"Última actividad hace {days} día(s) — {label}",
    )


def _amount_pressure_factor(
    session: Session, deal: Deal, pipeline_max_amount: int
) -> Factor:
    if pipeline_max_amount <= 0 or deal.amount_cents <= 0:
        return _factor(
            "amount_pressure",
            "Monto del deal",
            0.0,
            "Sin monto registrado",
        )
    # Log-scale: a deal at 10% of the pipeline max already contributes
    # substantially. log1p prevents huge deals from dominating.
    ratio = math.log1p(deal.amount_cents) / math.log1p(pipeline_max_amount)
    return _factor(
        "amount_pressure",
        "Monto del deal",
        ratio,
        f"Monto del deal {deal.amount_cents / 100:.0f} {deal.currency}",
    )


def _pipeline_max_amount(session: Session, pipeline_id: str) -> int:
    value = session.exec(
        select(func.max(Deal.amount_cents)).where(
            Deal.pipeline_id == pipeline_id,
            Deal.status == "open",
        )
    ).first()
    return int(value or 0)


Band = Literal["hot", "warm", "cold"]


def _band(score: int) -> Band:
    if score >= 65:
        return "hot"
    if score <= 34:
        return "cold"
    return "warm"


@dataclass
class Score:
    deal_id: str
    score: int
    band: Band
    factors: list[Factor]
    computed_at: datetime


def compute_score(session: Session, deal: Deal, now: datetime | None = None) -> Score:
    when = now or utcnow()
    pipeline_max = _pipeline_max_amount(session, deal.pipeline_id)

    factors = [
        _stage_probability_factor(session, deal),
        _recent_engagement_factor(session, deal, when),
        _inbound_reply_factor(session, deal, when),
        _freshness_factor(session, deal, when),
        _amount_pressure_factor(session, deal, pipeline_max),
    ]
    score = max(0, min(100, sum(f.contribution for f in factors)))
    return Score(
        deal_id=deal.id,
        score=score,
        band=_band(score),
        factors=factors,
        computed_at=when,
    )


__all__ = ["Band", "Factor", "Score", "WEIGHTS", "compute_score"]
