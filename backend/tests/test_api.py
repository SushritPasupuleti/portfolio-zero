from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["mode"] == "read-only"


def test_empty_summary_is_not_fabricated():
    client.delete("/api/local-data")
    response = client.get("/api/portfolio/summary")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "token_required"
    assert payload["total_value"] is None
    assert payload["message"] == "Setup required"


def test_token_status_and_save_workflow():
    client.delete("/api/local-data")
    token_status = client.get("/api/token/status")
    assert token_status.status_code == 200
    assert token_status.json()["configured"] is False

    save = client.post(
        "/api/token/save",
        json={"access_token": "test-token-123", "api_key": "test-key"},
    )
    assert save.status_code == 200
    assert save.json()["configured"] is True

    refreshed = client.get("/api/token/status")
    assert refreshed.status_code == 200
    assert refreshed.json()["configured"] is True


def test_import_preview_and_commit_round_trip():
    client.delete("/api/local-data")
    client.post(
        "/api/token/save",
        json={"access_token": "test-token-for-import", "api_key": "test-key"},
    )
    payload = {
        "source_type": "manual-import",
        "rows": [
            {
                "id": "eq-1",
                "instrument_name": "Reliance",
                "asset_class": "equity",
                "symbol": "RELIANCE",
                "quantity": 10,
                "average_cost": 2500,
                "last_price": 2900,
                "value": 29000,
                "pnl": 4000,
                "currency": "INR",
                "as_of": "2026-11-07T00:00:00+00:00",
            },
            {
                "id": "eq-2",
                "instrument_name": "HDFC Bank",
                "asset_class": "equity",
                "symbol": "HDFCBANK",
                "quantity": 12,
                "average_cost": 1600,
                "last_price": 1700,
                "value": 20400,
                "pnl": 1200,
                "currency": "INR",
                "as_of": "2026-11-07T00:00:00+00:00",
            },
        ],
    }

    preview = client.post("/api/import/preview", json=payload)
    assert preview.status_code == 200
    assert preview.json()["valid_rows"] == 2

    commit = client.post("/api/import/commit", json=payload)
    assert commit.status_code == 200
    assert commit.json()["status"] == "success"

    summary = client.get("/api/portfolio/summary")
    assert summary.status_code == 200
    assert summary.json()["total_value"] == 49400.0
    assert summary.json()["pnl"] == 5200.0

    allocations = client.get("/api/portfolio/allocations")
    assert allocations.status_code == 200
    bucket_map = {item["asset_class"]: item for item in allocations.json()}
    assert bucket_map["equity"]["value"] == 49400.0
