from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _seed_pipeline_and_deal(
    client, *, stage_index: int = 0, amount_cents: int = 1_000_000
) -> dict:
    pipeline = client.get("/api/pipelines").json()[0]
    stage = pipeline["stages"][stage_index]
    response = client.post(
        "/api/deals",
        json={
            "title": "Acme",
            "pipeline_id": pipeline["id"],
            "stage_id": stage["id"],
            "amount_cents": amount_cents,
            "currency": "CLP",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_score_includes_all_factors(client) -> None:
    deal = _seed_pipeline_and_deal(client)
    response = client.get(f"/api/deals/{deal['id']}/score")
    assert response.status_code == 200
    body = response.json()
    assert body["deal_id"] == deal["id"]
    assert 0 <= body["score"] <= 100
    factor_keys = {factor["key"] for factor in body["factors"]}
    assert factor_keys == {
        "stage_probability",
        "recent_engagement",
        "inbound_reply",
        "freshness",
        "amount_pressure",
    }
    assert body["band"] in ("hot", "warm", "cold")


def test_higher_stage_probability_increases_score(client) -> None:
    pipeline = client.get("/api/pipelines").json()[0]
    lead_stage = pipeline["stages"][0]      # probability 10
    propose_stage = pipeline["stages"][2]   # probability 50

    deal_low = client.post(
        "/api/deals",
        json={
            "title": "Low",
            "pipeline_id": pipeline["id"],
            "stage_id": lead_stage["id"],
            "amount_cents": 1_000_000,
            "currency": "CLP",
        },
    ).json()
    deal_high = client.post(
        "/api/deals",
        json={
            "title": "High",
            "pipeline_id": pipeline["id"],
            "stage_id": propose_stage["id"],
            "amount_cents": 1_000_000,
            "currency": "CLP",
        },
    ).json()

    low = client.get(f"/api/deals/{deal_low['id']}/score").json()
    high = client.get(f"/api/deals/{deal_high['id']}/score").json()
    assert high["score"] > low["score"]


def test_inbound_reply_factor_responds_to_recent_email(client) -> None:
    # Contact + deal with inbound email from contact in last 14 days
    contact = client.post(
        "/api/contacts",
        json={"first_name": "Pedro", "email": "pedro@acme.cl"},
    ).json()
    pipeline = client.get("/api/pipelines").json()[0]
    deal = client.post(
        "/api/deals",
        json={
            "title": "Acme",
            "pipeline_id": pipeline["id"],
            "stage_id": pipeline["stages"][1]["id"],
            "primary_contact_id": contact["id"],
            "amount_cents": 1_000_000,
            "currency": "CLP",
        },
    ).json()

    baseline = client.get(f"/api/deals/{deal['id']}/score").json()
    inbound_factor_before = next(
        f for f in baseline["factors"] if f["key"] == "inbound_reply"
    )
    assert inbound_factor_before["contribution"] == 0

    # Simulate an inbound email from the contact
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client.post(
        "/api/activities/import-external",
        json={
            "external_provider": "gmail",
            "external_message_id": "<reply@gmail>",
            "kind": "email",
            "subject": "Re: propuesta",
            "body": "Pedro responde",
            "from_email": "pedro@acme.cl",
            "to_email": "ventas@miempresa.cl",
            "completed_at": yesterday,
            "match_by_emails": ["pedro@acme.cl"],
        },
    )

    after = client.get(f"/api/deals/{deal['id']}/score").json()
    inbound_factor_after = next(
        f for f in after["factors"] if f["key"] == "inbound_reply"
    )
    assert inbound_factor_after["contribution"] == 20  # weight
    assert after["score"] > baseline["score"]


def test_lead_scoring_report_returns_hot_and_cold(client) -> None:
    pipeline = client.get("/api/pipelines").json()[0]
    lead_stage = pipeline["stages"][0]      # probability 10 → cold
    negociacion = pipeline["stages"][3]     # probability 70 → hot-ish

    for index in range(3):
        client.post(
            "/api/deals",
            json={
                "title": f"Lead {index}",
                "pipeline_id": pipeline["id"],
                "stage_id": lead_stage["id"],
                "amount_cents": 100_000,
                "currency": "CLP",
            },
        )
    for index in range(2):
        client.post(
            "/api/deals",
            json={
                "title": f"Hot {index}",
                "pipeline_id": pipeline["id"],
                "stage_id": negociacion["id"],
                "amount_cents": 5_000_000,
                "currency": "CLP",
            },
        )

    response = client.get(
        f"/api/reports/lead-scoring?pipeline_id={pipeline['id']}&limit=3"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["hot"]) > 0
    assert len(body["cold"]) > 0
    # The top hot deal scores >= the top cold deal score
    assert body["hot"][0]["score"] >= body["cold"][0]["score"]
    # Hot is sorted descending
    hot_scores = [entry["score"] for entry in body["hot"]]
    assert hot_scores == sorted(hot_scores, reverse=True)
