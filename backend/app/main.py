import csv
import io
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import ImportPreviewRequest
from .storage import (
    calculate_allocations,
    calculate_summary,
    clear_local_data,
    delete_zerodha_token,
    get_holdings,
    get_sips,
    get_sources,
    get_zerodha_token,
    initialize_db,
    insert_import_record,
    persist_holdings,
    persist_sips,
    save_zerodha_token,
    upsert_source_status,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_db()
    yield


app = FastAPI(
    title="Portfolio Puffin API",
    description="Read-only local investment dashboard API",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "read-only", "database": "ready"}


@app.get("/api/token/status")
def token_status() -> dict[str, object]:
    token = get_zerodha_token()
    if token.get("access_token"):
        return {
            "configured": True,
            "message": "Zerodha access token is configured locally.",
            "api_key": bool(token.get("api_key")),
        }
    return {
        "configured": False,
        "message": (
            "Zerodha access token is missing. Open the internal Streamlit token "
            "setup tool and save a token to SQLite."
        ),
        "api_key": False,
    }


@app.get("/api/portfolio/summary")
def portfolio_summary() -> dict:
    token = get_zerodha_token()
    if not token.get("access_token"):
        return {
            "total_value": None,
            "day_change": None,
            "invested": None,
            "pnl": None,
            "currency": "INR",
            "sources": [],
            "as_of": None,
            "status": "token_required",
            "warnings": [
                "Zerodha access token is not configured yet. Use the internal "
                "Streamlit UI to generate and save it."
            ],
            "message": "Setup required",
        }
    return calculate_summary().model_dump(mode="json")


@app.get("/api/portfolio/holdings")
def portfolio_holdings() -> dict[str, list[dict]]:
    return {"items": [holding.model_dump(mode="json") for holding in get_holdings()]}


@app.get("/api/portfolio/allocations")
def portfolio_allocations() -> list[dict]:
    return [bucket.model_dump(mode="json") for bucket in calculate_allocations()]


@app.get("/api/sources")
def collection_sources() -> dict[str, list[dict]]:
    return {"items": [source.model_dump(mode="json") for source in get_sources()]}


@app.get("/api/portfolio/export")
def export_portfolio_csv() -> dict[str, str]:
    holdings = get_holdings()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "instrument_name",
        "asset_class",
        "symbol",
        "quantity",
        "average_cost",
        "last_price",
        "value",
        "pnl",
        "currency",
        "source",
        "as_of",
    ])
    for holding in holdings:
        writer.writerow([
            holding.instrument_name,
            holding.asset_class,
            holding.symbol,
            holding.quantity,
            holding.average_cost,
            holding.last_price,
            holding.value,
            holding.pnl,
            holding.currency,
            holding.source,
            holding.as_of.isoformat() if holding.as_of else "",
        ])
    return {"filename": "portfolio.csv", "content": output.getvalue()}


@app.post("/api/import/preview")
def import_preview(payload: ImportPreviewRequest) -> dict:
    warnings: list[str] = []
    valid_rows: list[dict] = []

    for row in payload.rows:
        if not isinstance(row, dict):
            warnings.append("Encountered a non-object row and skipped it.")
            continue

        instrument_name = row.get("instrument_name") or row.get("name") or row.get("symbol")
        if not instrument_name:
            warnings.append("A row is missing an instrument name and was skipped.")
            continue

        normalized = dict(row)
        normalized.setdefault("asset_class", "equity")
        normalized.setdefault("currency", "INR")
        normalized.setdefault("source_name", payload.source_type)
        valid_rows.append(normalized)

    if not valid_rows:
        return {
            "source_type": payload.source_type,
            "row_count": len(payload.rows),
            "valid_rows": 0,
            "status": "invalid",
            "warnings": warnings,
        }

    if warnings:
        status = "partial"
    else:
        status = "valid"

    return {
        "source_type": payload.source_type,
        "row_count": len(payload.rows),
        "valid_rows": len(valid_rows),
        "status": status,
        "warnings": warnings,
    }


@app.post("/api/import/commit")
def import_commit(payload: ImportPreviewRequest) -> dict:
    preview = import_preview(payload)
    if preview["valid_rows"] == 0:
        raise HTTPException(status_code=400, detail="No valid rows were found for import.")

    source_name = payload.source_type or "manual-import"
    rows = [
        dict(row)
        for row in payload.rows
        if isinstance(row, dict)
        and (row.get("instrument_name") or row.get("name") or row.get("symbol"))
    ]
    committed = persist_holdings(rows, source_name)
    sip_rows = [
        {
            "id": row.get("id") or f"sip-{index}",
            "scheme_name": row.get("scheme_name")
            or row.get("name")
            or row.get("instrument_name"),
            "amount": row.get("amount"),
            "frequency": row.get("frequency"),
            "next_date": row.get("next_date"),
            "status": row.get("status") or "active",
            "as_of": row.get("as_of")
            or datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }
        for index, row in enumerate(rows)
        if row.get("amount") is not None or row.get("scheme_name") is not None
    ]
    persisted_sips = persist_sips(sip_rows, source_name)
    insert_import_record(payload.source_type, len(rows), "valid", preview["warnings"])
    upsert_source_status(
        source_name,
        payload.source_type,
        "connected",
        as_of=datetime.now(UTC),
        status_message="Data imported successfully.",
    )
    return {
        "status": "success",
        "rows_committed": committed + persisted_sips,
        "warnings": preview["warnings"],
    }


@app.post("/api/token/save")
def save_token(payload: dict[str, str]) -> dict[str, bool | str]:
    token = (payload.get("access_token") or "").strip()
    api_key = (payload.get("api_key") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="access_token is required")
    save_zerodha_token(token, api_key or None)
    return {"status": "saved", "configured": True}


@app.delete("/api/local-data")
def delete_local_data() -> dict[str, bool | str]:
    clear_local_data()
    delete_zerodha_token()
    return {"status": "deleted", "data_removed": True}


@app.get("/api/portfolio/sips")
def portfolio_sips() -> dict[str, list[dict]]:
    return {"items": [sip.model_dump(mode="json") for sip in get_sips()]}
