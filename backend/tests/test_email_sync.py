from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _seed_contact_with_email(client, email: str) -> str:
    response = client.post(
        "/api/contacts",
        json={"first_name": "Pedro", "last_name": "Acme", "email": email},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _import_payload(message_id: str = "<m1@gmail>") -> dict:
    return {
        "external_provider": "gmail",
        "external_message_id": message_id,
        "external_thread_id": "<t1@gmail>",
        "kind": "email",
        "subject": "Re: propuesta",
        "body": "Hola Pedro, te paso la propuesta actualizada...",
        "from_email": "pedro@acme.cl",
        "to_email": "ventas@miempresa.cl",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "owner": "Maria",
        "match_by_emails": ["pedro@acme.cl"],
    }


def test_import_external_resolves_contact_by_email(client) -> None:
    contact_id = _seed_contact_with_email(client, "pedro@acme.cl")

    response = client.post("/api/activities/import-external", json=_import_payload())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kind"] == "email"
    assert body["external_provider"] == "gmail"
    assert body["external_message_id"] == "<m1@gmail>"
    assert body["contact_id"] == contact_id
    assert body["pending_send"] is False


def test_import_external_is_idempotent(client) -> None:
    _seed_contact_with_email(client, "pedro@acme.cl")
    payload = _import_payload(message_id="<dup@gmail>")

    first = client.post("/api/activities/import-external", json=payload)
    second = client.post("/api/activities/import-external", json=payload)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]

    listing = client.get(
        "/api/activities?external_provider=gmail&page_size=50"
    )
    assert listing.status_code == 200
    rows = listing.json()
    assert len([row for row in rows if row["external_message_id"] == "<dup@gmail>"]) == 1


def test_import_external_rejects_when_no_anchor_resolved(client) -> None:
    payload = _import_payload(message_id="<unmatched@gmail>")
    payload["match_by_emails"] = ["someone@unknown.cl"]
    response = client.post("/api/activities/import-external", json=payload)
    assert response.status_code == 400
    assert "anchor" in response.json()["detail"].lower()


def test_email_sync_status_counts(client) -> None:
    _seed_contact_with_email(client, "pedro@acme.cl")

    initial = client.get("/api/sync/email-status").json()
    assert initial["provider"] == "gmail"
    assert initial["total_synced"] == 0
    assert initial["last_synced_at"] is None
    assert initial["pending_send_count"] == 0

    client.post(
        "/api/activities/import-external",
        json=_import_payload(message_id="<m1@gmail>"),
    )
    client.post(
        "/api/activities/import-external",
        json=_import_payload(message_id="<m2@gmail>"),
    )

    after = client.get("/api/sync/email-status").json()
    assert after["total_synced"] == 2
    assert after["last_synced_at"] is not None
    assert after["last_24h"] == 2


def test_pending_send_filter(client) -> None:
    contact_id = _seed_contact_with_email(client, "pedro@acme.cl")

    # Stage a pending email (the "Componer email" UI flow)
    pending = client.post(
        "/api/activities",
        json={
            "kind": "email",
            "subject": "Borrador para Pedro",
            "body": "Hola Pedro, ...",
            "contact_id": contact_id,
            "owner": "Maria",
            "pending_send": True,
            "to_email": "pedro@acme.cl",
        },
    )
    assert pending.status_code == 201
    pending_id = pending.json()["id"]

    pending_listing = client.get(
        "/api/activities?kind=email&pending_send=true&page_size=10"
    ).json()
    assert any(row["id"] == pending_id for row in pending_listing)

    # Marking complete clears pending_send
    completed = client.post(f"/api/activities/{pending_id}/complete")
    assert completed.status_code == 200
    assert completed.json()["pending_send"] is False
    assert completed.json()["completed_at"] is not None


def test_import_external_uses_explicit_deal_anchor(client) -> None:
    pipelines = client.get("/api/pipelines").json()
    pipeline = pipelines[0]
    stage = pipeline["stages"][0]
    contact_id = _seed_contact_with_email(client, "pedro@acme.cl")

    deal = client.post(
        "/api/deals",
        json={
            "title": "Acme Q2",
            "pipeline_id": pipeline["id"],
            "stage_id": stage["id"],
            "primary_contact_id": contact_id,
            "amount_cents": 500000000,
            "currency": "CLP",
        },
    )
    assert deal.status_code == 201, deal.text
    deal_id = deal.json()["id"]

    payload = _import_payload(message_id="<deal-anchor@gmail>")
    payload["deal_id"] = deal_id

    response = client.post("/api/activities/import-external", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["deal_id"] == deal_id


def test_import_external_24h_window_excludes_old(client) -> None:
    # Activities older than 24h should still count in total_synced but not in
    # last_24h. We backdate created_at directly because the import endpoint
    # does not expose it (by design — we trust completed_at as the email date).
    _seed_contact_with_email(client, "pedro@acme.cl")
    yesterday = datetime.now(timezone.utc) - timedelta(hours=48)

    response = client.post(
        "/api/activities/import-external",
        json={
            **_import_payload(message_id="<old@gmail>"),
            "completed_at": yesterday.isoformat(),
        },
    )
    assert response.status_code == 200

    from sqlmodel import Session, select

    from app.database import engine
    from app.models import Activity

    with Session(engine) as session:
        activity = session.exec(
            select(Activity).where(Activity.external_message_id == "<old@gmail>")
        ).first()
        assert activity is not None
        activity.created_at = yesterday.replace(tzinfo=None)
        session.add(activity)
        session.commit()

    status = client.get("/api/sync/email-status").json()
    assert status["total_synced"] >= 1
    assert status["last_24h"] == 0
