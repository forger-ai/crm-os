from __future__ import annotations

from datetime import datetime, timezone


def _lead(message_id: str = "<lead1@gmail>", email: str = "nuevo@prospecto.cl") -> dict:
    return {
        "external_message_id": message_id,
        "external_thread_id": "<t-lead1@gmail>",
        "from_email": email,
        "from_name": "Ana Prospecto",
        "subject": "Consulta por sus servicios",
        "body": "Hola, vi su sitio y me interesa cotizar. Saludos, Ana.",
        "received_at": datetime.now(timezone.utc).isoformat(),
        "confidence": 0.8,
        "reason": "Consulta comercial entrante de un remitente desconocido",
        "suggested_first_name": "Ana",
        "suggested_last_name": "Prospecto",
        "suggested_org_name": "Prospecto SpA",
        "suggested_phone": "+56911111111",
    }


def _scan(leads: list[dict]) -> dict:
    return {"polled_at": datetime.now(timezone.utc).isoformat(), "leads": leads}


def test_config_defaults(client) -> None:
    config = client.get("/api/intake/config")
    assert config.status_code == 200, config.text
    body = config.json()
    assert body["enabled"] is False
    assert body["mode"] == "review"
    assert body["poll_interval_minutes"] == 5
    assert body["last_polled_at"] is None
    assert body["since_iso"] is not None
    assert body["pending_count"] == 0


def test_update_config(client) -> None:
    response = client.put(
        "/api/intake/config", json={"enabled": True, "mode": "auto"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["enabled"] is True
    assert body["mode"] == "auto"
    # Partial update keeps the untouched field.
    response = client.put("/api/intake/config", json={"enabled": False})
    assert response.json()["mode"] == "auto"


def test_update_poll_interval(client) -> None:
    response = client.put(
        "/api/intake/config", json={"poll_interval_minutes": 15}
    )
    assert response.status_code == 200, response.text
    assert response.json()["poll_interval_minutes"] == 15
    # Out-of-range values are rejected.
    assert (
        client.put("/api/intake/config", json={"poll_interval_minutes": 0}).status_code
        == 422
    )


def test_scan_result_creates_pending_lead(client) -> None:
    summary = client.post("/api/intake/scan-result", json=_scan([_lead()]))
    assert summary.status_code == 200, summary.text
    assert summary.json() == {
        "created": 1,
        "duplicates": 0,
        "skipped_known": 0,
        "promoted": 0,
    }

    pending = client.get("/api/intake/leads?status=pending").json()
    assert len(pending) == 1
    assert pending[0]["status"] == "pending"
    assert pending[0]["from_email"] == "nuevo@prospecto.cl"
    assert pending[0]["created_contact_id"] is None


def test_scan_result_is_idempotent(client) -> None:
    payload = _scan([_lead(message_id="<dup@gmail>")])
    first = client.post("/api/intake/scan-result", json=payload)
    second = client.post("/api/intake/scan-result", json=payload)
    assert first.json()["created"] == 1
    assert second.json()["created"] == 0
    assert second.json()["duplicates"] == 1
    assert len(client.get("/api/intake/leads").json()) == 1


def test_scan_result_skips_known_contact(client) -> None:
    created = client.post(
        "/api/contacts",
        json={"first_name": "Ya", "last_name": "Existe", "email": "conocido@acme.cl"},
    )
    assert created.status_code == 201

    summary = client.post(
        "/api/intake/scan-result",
        json=_scan([_lead(message_id="<known@gmail>", email="conocido@acme.cl")]),
    )
    assert summary.json()["skipped_known"] == 1
    assert summary.json()["created"] == 0
    assert client.get("/api/intake/leads").json() == []


def test_auto_mode_promotes_immediately(client) -> None:
    client.put("/api/intake/config", json={"mode": "auto"})

    summary = client.post(
        "/api/intake/scan-result", json=_scan([_lead(message_id="<auto@gmail>")])
    )
    assert summary.json()["promoted"] == 1

    leads = client.get("/api/intake/leads").json()
    assert len(leads) == 1
    lead = leads[0]
    assert lead["status"] == "accepted"
    assert lead["created_contact_id"] is not None
    assert lead["created_deal_id"] is not None

    deal = client.get(f"/api/deals/{lead['created_deal_id']}")
    assert deal.status_code == 200, deal.text
    deal_body = deal.json()
    assert deal_body["primary_contact_id"] == lead["created_contact_id"]
    # The original email is logged on the new deal's timeline.
    emails = [a for a in deal_body["activities"] if a["kind"] == "email"]
    assert len(emails) == 1
    assert emails[0]["from_email"] == "nuevo@prospecto.cl"


def test_accept_lead_promotes_with_overrides(client) -> None:
    client.post(
        "/api/intake/scan-result", json=_scan([_lead(message_id="<acc@gmail>")])
    )
    lead_id = client.get("/api/intake/leads?status=pending").json()[0]["id"]

    accepted = client.post(
        f"/api/intake/leads/{lead_id}/accept",
        json={"first_name": "Ana María", "organization_name": "Prospecto Limitada"},
    )
    assert accepted.status_code == 200, accepted.text
    body = accepted.json()
    assert body["status"] == "accepted"
    assert body["created_contact_id"] is not None

    contact = client.get(f"/api/contacts/{body['created_contact_id']}").json()
    assert contact["first_name"] == "Ana María"
    assert any(
        link["organization_name"] == "Prospecto Limitada"
        for link in contact["organizations"]
    )

    # Already-accepted lead cannot be accepted again.
    again = client.post(f"/api/intake/leads/{lead_id}/accept", json={})
    assert again.status_code == 400


def test_dismiss_lead(client) -> None:
    client.post(
        "/api/intake/scan-result", json=_scan([_lead(message_id="<dis@gmail>")])
    )
    lead_id = client.get("/api/intake/leads?status=pending").json()[0]["id"]

    dismissed = client.post(f"/api/intake/leads/{lead_id}/dismiss")
    assert dismissed.status_code == 200
    assert dismissed.json()["status"] == "dismissed"
    assert client.get("/api/intake/leads?status=pending").json() == []

    # A dismissed lead cannot be accepted afterwards.
    accept = client.post(f"/api/intake/leads/{lead_id}/accept", json={})
    assert accept.status_code == 400


def test_scan_result_advances_cursor(client) -> None:
    before = client.get("/api/intake/config").json()
    assert before["last_polled_at"] is None

    client.post("/api/intake/scan-result", json=_scan([]))

    after = client.get("/api/intake/config").json()
    assert after["last_polled_at"] is not None
    # The next window starts before the cursor (overlap guard).
    assert after["since_iso"] < after["last_polled_at"]


def test_accept_missing_lead_returns_404(client) -> None:
    response = client.post("/api/intake/leads/does-not-exist/accept", json={})
    assert response.status_code == 404
