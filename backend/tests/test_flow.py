"""End-to-end integration test that exercises every router at least once."""

from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone


def _default_pipeline(client) -> tuple[str, list[dict]]:
    pipelines = client.get("/api/pipelines").json()
    pipeline = pipelines[0]
    return pipeline["id"], pipeline["stages"]


def _stage_id(stages: list[dict], name: str) -> str:
    return next(s["id"] for s in stages if s["name"] == name)


def test_full_flow(client) -> None:
    pipeline_id, stages = _default_pipeline(client)
    lead_stage = _stage_id(stages, "Lead")
    proposal_stage = _stage_id(stages, "Propuesta")

    # 1. Organization + free-text registry
    org = client.post(
        "/api/organizations",
        json={
            "name": "Acme S.A.",
            "domain": "acme.cl",
            "industry": "manufactura",
            "owner": "kupa",
        },
    ).json()
    assert org["name"] == "Acme S.A."

    industries = client.get("/api/field-values?scope=organization.industry").json()
    assert any(v["value"] == "manufactura" for v in industries)

    # 2. Contact + link to org
    contact = client.post(
        "/api/contacts",
        json={
            "first_name": "Maria",
            "last_name": "Perez",
            "email": "maria@acme.cl",
            "job_title": "Compras",
            "owner": "kupa",
        },
    ).json()

    link = client.post(
        f"/api/organizations/{org['id']}/contacts",
        json={"contact_id": contact["id"], "role": "Decisora", "is_primary": True},
    ).json()
    assert link["role"] == "Decisora"

    org_detail = client.get(f"/api/organizations/{org['id']}").json()
    assert len(org_detail["contacts"]) == 1
    assert org_detail["contacts"][0]["id"] == contact["id"]

    # 3. Pipeline custom stage
    new_stage = client.post(
        f"/api/pipelines/{pipeline_id}/stages",
        json={
            "name": "Demo agendada",
            "probability_default": 25,
            "color": "#22c55e",
        },
    ).json()
    assert new_stage["name"] == "Demo agendada"

    # 4. Deal create + move + win
    deal_resp = client.post(
        "/api/deals",
        json={
            "title": "Acme - integracion ERP",
            "organization_id": org["id"],
            "primary_contact_id": contact["id"],
            "pipeline_id": pipeline_id,
            "stage_id": lead_stage,
            "amount_cents": 4_500_000,
            "currency": "CLP",
            "owner": "kupa",
            "expected_close_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        },
    )
    assert deal_resp.status_code == 201, deal_resp.text
    deal = deal_resp.json()
    assert deal["status"] == "open"
    assert deal["probability"] == 10  # default for Lead

    moved = client.post(
        f"/api/deals/{deal['id']}/move",
        json={"stage_id": proposal_stage, "note": "envie propuesta"},
    ).json()
    assert moved["stage_id"] == proposal_stage
    assert len(moved["stage_history"]) == 2  # created + moved

    # 5. Activity (call due tomorrow) + complete
    activity = client.post(
        "/api/activities",
        json={
            "kind": "call",
            "subject": "Llamar para feedback",
            "deal_id": deal["id"],
            "due_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "owner": "kupa",
        },
    ).json()
    completed = client.post(f"/api/activities/{activity['id']}/complete").json()
    assert completed["completed_at"] is not None

    # Overdue activity for the same deal (yesterday)
    overdue = client.post(
        "/api/activities",
        json={
            "kind": "task",
            "subject": "Pedir referencias",
            "deal_id": deal["id"],
            "due_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        },
    ).json()
    assert overdue["completed_at"] is None

    # 6. Note
    note = client.post(
        "/api/notes",
        json={"body": "El contacto pidió descuento por volumen.", "deal_id": deal["id"]},
    ).json()
    assert note["body"].startswith("El contacto")

    # 7. Custom field on deal
    field = client.post(
        "/api/custom-fields",
        json={
            "entity": "deal",
            "key": "fuente",
            "label": "Fuente",
            "type": "select",
            "options": ["Referido", "LinkedIn", "Inbound"],
        },
    ).json()
    client.put(
        f"/api/custom-fields/values/deal/{deal['id']}",
        json=[{"field_id": field["id"], "value": "Referido"}],
    )
    deal_detail = client.get(f"/api/deals/{deal['id']}").json()
    assert any(cf["value"] == "Referido" for cf in deal_detail["custom_fields"])

    # 8. CSV import (organizations) — one new, one duplicate, one missing-name
    csv = "name,industry,owner\nGlobex S.A.,retail,kupa\nAcme S.A.,manufactura,kupa\n,banca,otro\n"
    resp = client.post(
        "/api/imports/organizations",
        files={"file": ("orgs.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rows_total"] == 3
    assert body["rows_imported"] == 1
    assert body["rows_skipped"] == 1
    assert body["rows_failed"] == 1

    history = client.get("/api/imports").json()
    assert len(history) == 1

    # 9. Search
    hits = client.get("/api/search?q=acme").json()
    assert any(h["id"] == org["id"] for h in hits["organizations"])
    assert any(h["id"] == deal["id"] for h in hits["deals"])

    # 10. Reports
    pv = client.get(f"/api/reports/pipeline-value?pipeline_id={pipeline_id}").json()
    proposal_row = next(p for p in pv if p["stage_name"] == "Propuesta")
    assert proposal_row["deals_count"] == 1
    assert proposal_row["by_currency"]["CLP"] == 4_500_000

    overview = client.get("/api/reports/activities-overview").json()
    assert overview["overdue"] == 1

    weekly = client.get("/api/reports/weekly-summary").json()
    assert weekly["deals_open"] == 1
    assert weekly["pipeline_value"]["CLP"] == 4_500_000

    # 11. Win the deal -> reports show it as won
    won = client.post(f"/api/deals/{deal['id']}/win", json={"note": "firmado"}).json()
    assert won["status"] == "won"
    weekly2 = client.get("/api/reports/weekly-summary").json()
    assert weekly2["deals_won_this_week"] == 1
    assert weekly2["deals_open"] == 0


def test_value_error_returns_400(client) -> None:
    # Activity without any anchor (no deal/contact/org) -> ValueError -> 400
    resp = client.post(
        "/api/activities",
        json={"kind": "task", "subject": "huérfana"},
    )
    assert resp.status_code == 400
    assert "at least one" in resp.json()["detail"].lower()


def test_stage_must_belong_to_pipeline(client) -> None:
    pipelines = client.get("/api/pipelines").json()
    main_pipeline = pipelines[0]
    main_stage = main_pipeline["stages"][0]["id"]

    other = client.post(
        "/api/pipelines",
        json={"name": "Servicios", "is_default": False},
    ).json()

    resp = client.post(
        "/api/deals",
        json={
            "title": "Cross-pipeline deal",
            "pipeline_id": other["id"],
            "stage_id": main_stage,  # wrong: belongs to other pipeline
            "amount_cents": 0,
            "currency": "CLP",
        },
    )
    assert resp.status_code == 400
    assert "stage" in resp.json()["detail"].lower()
