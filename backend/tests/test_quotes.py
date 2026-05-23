from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _seed_deal(client, *, currency: str = "CLP", amount_cents: int = 9990000) -> dict:
    pipeline = client.get("/api/pipelines").json()[0]
    stage = pipeline["stages"][0]
    response = client.post(
        "/api/deals",
        json={
            "title": "Acme Q2",
            "pipeline_id": pipeline["id"],
            "stage_id": stage["id"],
            "amount_cents": amount_cents,
            "currency": currency,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _seed_product(client, **overrides) -> dict:
    payload = {
        "sku": "PROD-001",
        "name": "Licencia Pro",
        "default_unit_price_cents": 1000000,
        "default_currency": "CLP",
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_quote_with_lines_and_totals(client) -> None:
    deal = _seed_deal(client)
    product = _seed_product(client)

    response = client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "title": "Propuesta v1",
            "tax_rate": 19.0,
            "lines": [
                {
                    "product_id": product["id"],
                    "name": product["name"],
                    "quantity": 2,
                    "unit_price_cents": 1000000,
                    "discount_pct": 0,
                },
                {
                    "name": "Implementación",
                    "quantity": 1,
                    "unit_price_cents": 500000,
                    "discount_pct": 10,
                },
            ],
        },
    )
    assert response.status_code == 201, response.text
    quote = response.json()
    assert quote["number"].startswith("Q-")
    assert quote["status"] == "draft"
    assert quote["currency"] == "CLP"
    # subtotal = 2*1.000.000 + 0.9*500.000 = 2.450.000
    assert quote["subtotal_cents"] == 2_450_000
    # tax = 19% rounded = 465.500
    assert quote["tax_cents"] == 465_500
    assert quote["total_cents"] == 2_915_500
    assert len(quote["lines"]) == 2
    # positions are 0,1
    positions = sorted(line["position"] for line in quote["lines"])
    assert positions == [0, 1]


def test_quote_number_sequence_per_year(client) -> None:
    deal = _seed_deal(client)
    numbers = []
    for _ in range(3):
        response = client.post(
            "/api/quotes",
            json={
                "deal_id": deal["id"],
                "title": "Propuesta",
                "tax_rate": 0,
            },
        )
        numbers.append(response.json()["number"])

    year = datetime.now(timezone.utc).year
    assert numbers == [
        f"Q-{year}-001",
        f"Q-{year}-002",
        f"Q-{year}-003",
    ]


def test_status_transitions(client) -> None:
    deal = _seed_deal(client)
    quote = client.post(
        "/api/quotes",
        json={"deal_id": deal["id"], "title": "Q1", "tax_rate": 0},
    ).json()

    # Sent
    sent = client.post(f"/api/quotes/{quote['id']}/send").json()
    assert sent["status"] == "sent"
    assert sent["sent_at"] is not None

    # Accepted
    accepted = client.post(f"/api/quotes/{quote['id']}/accept").json()
    assert accepted["status"] == "accepted"
    assert accepted["decided_at"] is not None

    # Can't accept again or send after accept
    bad = client.post(f"/api/quotes/{quote['id']}/send")
    assert bad.status_code == 400


def test_cannot_edit_after_sent(client) -> None:
    deal = _seed_deal(client)
    quote = client.post(
        "/api/quotes",
        json={"deal_id": deal["id"], "title": "Q1", "tax_rate": 0},
    ).json()
    client.post(f"/api/quotes/{quote['id']}/send")

    response = client.patch(
        f"/api/quotes/{quote['id']}", json={"title": "Otro título"}
    )
    assert response.status_code == 400
    assert "draft" in response.json()["detail"].lower()


def test_add_line_and_recalculate(client) -> None:
    deal = _seed_deal(client)
    quote = client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "title": "Q1",
            "tax_rate": 19,
            "lines": [
                {
                    "name": "A",
                    "quantity": 1,
                    "unit_price_cents": 1_000_000,
                }
            ],
        },
    ).json()
    assert quote["subtotal_cents"] == 1_000_000

    updated = client.post(
        f"/api/quotes/{quote['id']}/lines",
        json={"name": "B", "quantity": 2, "unit_price_cents": 250_000},
    ).json()
    assert updated["subtotal_cents"] == 1_500_000
    assert updated["total_cents"] == int(round(1_500_000 * 1.19))


def test_delete_line_repositions(client) -> None:
    deal = _seed_deal(client)
    quote = client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "title": "Q1",
            "tax_rate": 0,
            "lines": [
                {"name": "A", "quantity": 1, "unit_price_cents": 100},
                {"name": "B", "quantity": 1, "unit_price_cents": 200},
                {"name": "C", "quantity": 1, "unit_price_cents": 300},
            ],
        },
    ).json()
    middle_id = next(line["id"] for line in quote["lines"] if line["name"] == "B")

    updated = client.delete(
        f"/api/quotes/{quote['id']}/lines/{middle_id}"
    ).json()

    names_by_position = {line["position"]: line["name"] for line in updated["lines"]}
    assert names_by_position == {0: "A", 1: "C"}


def test_lazy_expiration(client) -> None:
    deal = _seed_deal(client)
    past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    quote = client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "title": "Q1",
            "tax_rate": 0,
            "valid_until": past,
        },
    ).json()
    assert quote["status"] == "draft"

    refreshed = client.get(f"/api/quotes/{quote['id']}").json()
    assert refreshed["status"] == "expired"


def test_product_default_price_pulled_when_unit_price_zero(client) -> None:
    deal = _seed_deal(client)
    product = _seed_product(client, default_unit_price_cents=750_000)

    quote = client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "title": "Q1",
            "tax_rate": 0,
            "lines": [
                {
                    "product_id": product["id"],
                    "name": product["name"],
                    "quantity": 2,
                    "unit_price_cents": 0,  # signal: pull product default
                }
            ],
        },
    ).json()
    assert quote["lines"][0]["unit_price_cents"] == 750_000
    assert quote["subtotal_cents"] == 1_500_000
