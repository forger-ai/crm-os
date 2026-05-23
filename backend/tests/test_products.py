from __future__ import annotations


def _create_product(client, **overrides) -> dict:
    payload = {
        "sku": "PROD-001",
        "name": "Licencia Pro",
        "description": "Suscripción anual Pro",
        "category": "Software",
        "default_unit_price_cents": 9990000,
        "default_currency": "CLP",
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_list_products(client) -> None:
    _create_product(client)
    _create_product(client, sku=None, name="Servicio Setup", default_unit_price_cents=0)

    rows = client.get("/api/products").json()
    assert len(rows) == 2
    names = sorted(p["name"] for p in rows)
    assert names == ["Licencia Pro", "Servicio Setup"]


def test_duplicate_sku_is_rejected(client) -> None:
    _create_product(client)
    duplicate = client.post(
        "/api/products",
        json={
            "sku": "PROD-001",
            "name": "Otra cosa",
            "default_unit_price_cents": 1000,
            "default_currency": "CLP",
        },
    )
    assert duplicate.status_code == 409


def test_filter_by_category_and_search(client) -> None:
    _create_product(client, sku="SW-1", name="Licencia Pro", category="Software")
    _create_product(client, sku="HW-1", name="Notebook", category="Hardware")

    only_sw = client.get("/api/products?category=Software").json()
    assert {p["name"] for p in only_sw} == {"Licencia Pro"}

    by_text = client.get("/api/products?q=note").json()
    assert {p["name"] for p in by_text} == {"Notebook"}


def test_archived_excluded_by_default(client) -> None:
    product = _create_product(client)
    archived = client.patch(
        f"/api/products/{product['id']}", json={"archived": True}
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True

    rows_default = client.get("/api/products").json()
    assert all(p["archived"] is False for p in rows_default)

    rows_all = client.get("/api/products?include_archived=true").json()
    assert any(p["archived"] is True for p in rows_all)


def test_delete_archives_when_referenced(client) -> None:
    # Set up: a product referenced by a quote line cannot be hard-deleted,
    # it is archived instead. Build the dependency tree.
    product = _create_product(client)
    pipeline = client.get("/api/pipelines").json()[0]
    stage = pipeline["stages"][0]
    deal = client.post(
        "/api/deals",
        json={
            "title": "Acme Q2",
            "pipeline_id": pipeline["id"],
            "stage_id": stage["id"],
            "amount_cents": 9990000,
            "currency": "CLP",
        },
    ).json()
    client.post(
        "/api/quotes",
        json={
            "deal_id": deal["id"],
            "title": "Propuesta v1",
            "tax_rate": 19.0,
            "lines": [
                {
                    "product_id": product["id"],
                    "name": product["name"],
                    "quantity": 1,
                    "unit_price_cents": product["default_unit_price_cents"],
                }
            ],
        },
    )

    response = client.delete(f"/api/products/{product['id']}")
    assert response.status_code == 204

    fresh = client.get(f"/api/products/{product['id']}").json()
    assert fresh["archived"] is True
