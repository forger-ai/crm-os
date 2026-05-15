from __future__ import annotations


def test_health(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "ok"


def test_default_pipeline_seeded(client) -> None:
    response = client.get("/api/pipelines")
    assert response.status_code == 200
    pipelines = response.json()
    assert len(pipelines) == 1
    pipeline = pipelines[0]
    assert pipeline["name"] == "Ventas"
    assert pipeline["is_default"] is True
    stages = pipeline["stages"]
    assert [s["name"] for s in stages] == [
        "Lead",
        "Calificado",
        "Propuesta",
        "Negociacion",
        "Cerrado Ganado",
        "Cerrado Perdido",
    ]
    assert stages[-2]["is_won"] is True
    assert stages[-1]["is_lost"] is True


def test_default_currencies_seeded(client) -> None:
    response = client.get("/api/field-values?scope=deal.currency")
    assert response.status_code == 200
    values = [item["value"] for item in response.json()]
    for code in ("CLP", "USD", "EUR", "UF"):
        assert code in values
