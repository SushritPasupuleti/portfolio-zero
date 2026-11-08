import csv
import io
from collections import Counter
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from kiteconnect import KiteConnect
from kiteconnect.exceptions import (
    KiteException,
    NetworkException,
    PermissionException,
    TokenException,
)

from .kite_adapter import SOURCE_NAME, SOURCE_TYPE, sync_portfolio
from .models import (
    Holding,
    ImportPreviewRequest,
    KiteLoginUrlRequest,
    ManualPositionBulkEdit,
    ManualPositionIds,
    ManualPositionImport,
    ManualPositionInput,
    ManualSipEntryStatus,
    ManualSipScheduleInput,
    Preferences,
)
from .ollama_adapter import (
    OllamaUnavailable,
    generate_ideas_report,
    generate_news_report,
    generate_portfolio_insights,
    generate_typed_portfolio_report,
    installed_models,
    validate_ollama_endpoint,
)
from .storage import (
    bulk_edit_manual_positions,
    calculate_allocations,
    calculate_summary,
    clear_local_data,
    delete_manual_positions,
    delete_zerodha_token,
    get_ai_report,
    get_holdings,
    get_news_articles,
    get_preferences,
    get_sips,
    get_sources,
    get_zerodha_token,
    get_zerodha_credentials,
    import_manual_positions,
    initialize_db,
    insert_import_record,
    list_ai_reports,
    list_manual_positions,
    list_manual_sip_schedules,
    persist_holdings,
    persist_sips,
    refresh_manual_sip_entries,
    save_ai_report,
    save_manual_positions,
    save_manual_sip_schedule,
    save_preferences,
    save_zerodha_token,
    save_zerodha_credentials,
    set_manual_sip_enabled,
    set_manual_sip_entry_status,
    upsert_source_status,
)
from .yahoo_news_adapter import NEWS_SOURCE_TYPE, sync_idea_news, sync_portfolio_news
from .yfinance_adapter import sync_daily_prices


def _finalize_ai_report(
    report: dict[str, object],
    report_type: str,
    preferences: Preferences,
    holdings: list[Holding],
    articles: list[dict[str, object]],
) -> dict[str, object]:
    captured_at = datetime.now(UTC).isoformat()
    source_counts = dict(sorted(Counter(
        str(holding.source or "Unknown") for holding in holdings
    ).items()))
    price_source_counts = dict(sorted(Counter(
        str(holding.price_source or "Not recorded") for holding in holdings
    ).items()))
    news_source_counts = dict(sorted(Counter(
        str(article.get("publisher") or article.get("source_key") or "Unknown")
        for article in articles
    ).items()))
    portfolio_dates = [holding.as_of for holding in holdings if holding.as_of]
    latest_portfolio_date = max(
        portfolio_dates,
        key=lambda value: value.replace(tzinfo=UTC)
        if value.tzinfo is None else value.astimezone(UTC),
        default=None,
    )
    metadata: dict[str, object] = {
        "report_type": report_type,
        "report_purpose": str(report.get("scope") or report_type),
        "input_holding_names": [holding.instrument_name for holding in holdings[:200]],
        "input_tickers": [holding.symbol for holding in holdings[:200] if holding.symbol],
        "input_news_ids": [str(article.get("id")) for article in articles[:150] if article.get("id")],
        "prompt_version": "2026-11-08",
        "model": report.get("model"),
        "local_endpoint": preferences.ollama_endpoint,
        "model_completed_at_utc": report.get("generated_at"),
        "captured_at_utc": captured_at,
        "portfolio_row_count": len(holdings),
        "portfolio_sources": source_counts,
        "price_sources": price_source_counts,
        "portfolio_as_of_utc": (
            latest_portfolio_date.replace(tzinfo=UTC).isoformat()
            if latest_portfolio_date and latest_portfolio_date.tzinfo is None
            else latest_portfolio_date.astimezone(UTC).isoformat()
            if latest_portfolio_date else None
        ),
        "news_article_count": len(articles),
        "news_ticker_mentions": sum(
            len(article.get("related_tickers") or []) for article in articles
        ),
        "news_sources": news_source_counts,
        "news_lookback_hours": preferences.news_lookback_hours,
        "news_article_limit": preferences.news_max_articles,
    }
    report["markdown"] = f"{report['markdown'].rstrip()}\n\n{_run_metadata_markdown(metadata)}"
    saved = save_ai_report(
        report_type,
        str(report["model"]),
        str(report["markdown"]),
        report.get("generated_at") if isinstance(report.get("generated_at"), str) else None,
        str(report["scope"]),
        metadata,
    )
    return {**report, **saved}


def _run_metadata_markdown(metadata: dict[str, object]) -> str:
    labels = {
        "report_type": "Report type",
        "model": "Model",
        "local_endpoint": "Local endpoint",
        "model_completed_at_utc": "Model completion (UTC)",
        "captured_at_utc": "Run captured (UTC)",
        "portfolio_row_count": "Portfolio rows",
        "portfolio_sources": "Portfolio sources",
        "price_sources": "Price sources",
        "portfolio_as_of_utc": "Portfolio snapshot as of (UTC)",
        "news_article_count": "News articles included",
        "news_ticker_mentions": "Matched ticker mentions",
        "news_sources": "News sources",
        "news_lookback_hours": "News lookback (hours)",
        "news_article_limit": "Configured article limit",
    }
    rows = ["## Run metadata", "", "| Field | Value |", "| --- | --- |"]
    for key, label in labels.items():
        value = metadata.get(key)
        if isinstance(value, dict):
            rendered = ", ".join(f"{name} ({count})" for name, count in value.items())
            rendered = rendered or "None recorded"
        else:
            rendered = str(value) if value not in (None, "") else "Not available"
        rendered = rendered.replace("|", "\\|").replace("\n", " ")
        rows.append(f"| {label} | {rendered} |")
    return "\n".join(rows)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_db()
    refresh_manual_sip_entries()
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
    configured = bool(token.get("access_token"))
    if configured:
        return {
            "configured": True,
            "state": "token_configured",
            "message": "Zerodha Personal token is stored in a local secure secret store.",
            "api_key": bool(token.get("api_key")),
        }
    return {
        "configured": False,
        "state": "not_configured",
        "message": (
            "Zerodha Personal access token is missing. Open Settings in the React dashboard "
            "to complete the local Kite login and save a fresh token."
        ),
        "api_key": bool(token.get("api_key")),
    }


@app.post("/api/token/login-url")
def token_login_url(payload: KiteLoginUrlRequest) -> dict[str, str]:
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=422, detail="Enter your Kite API key first.")
    return {"login_url": KiteConnect(api_key=api_key).login_url()}


@app.get("/api/token/credentials")
def token_credentials() -> dict[str, object]:
    credentials = get_zerodha_credentials()
    return {"api_key": credentials["api_key"], "api_secret": credentials["api_secret"],
            "configured": bool(credentials["api_key"] and credentials["api_secret"])}


@app.put("/api/token/credentials")
def save_token_credentials(payload: dict[str, str]) -> dict[str, bool]:
    api_key = (payload.get("api_key") or "").strip()
    api_secret = (payload.get("api_secret") or "").strip()
    if not api_key or not api_secret:
        raise HTTPException(status_code=422, detail="Both Kite API key and API secret are required.")
    save_zerodha_credentials(api_key, api_secret)
    return {"configured": True}


@app.post("/api/token/exchange")
async def exchange_kite_request_token(request: Request) -> dict[str, bool]:
    # Read the regular browser form body directly; the API secret never enters React state.
    from urllib.parse import parse_qs

    form = parse_qs((await request.body()).decode("utf-8"), keep_blank_values=True)
    request_token = (form.get("request_token", [""])[0]).strip()
    credentials = get_zerodha_credentials()
    api_key, api_secret = credentials["api_key"], credentials["api_secret"]
    if not api_key or not api_secret or not request_token:
        raise HTTPException(status_code=409, detail="Save your Kite API key and secret in Settings first.")
    try:
        session = KiteConnect(api_key=api_key).generate_session(
            request_token,
            api_secret=api_secret,
        )
    except Exception as exc:
        message = str(exc)
        lower = message.lower()
        if "user is not enabled for the app" in lower:
            message = (
                "Kite did not enable the account signed into the browser for this app. "
                "Check that the app's Zerodha Client ID exactly matches the account you "
                "authorize, and use the API key from that same app. If you use multiple "
                "accounts, sign out of Kite and retry with the linked account. This is an "
                "account/app binding issue; Personal app market-data limits are unrelated."
            )
        elif "invalid request token" in lower or "request token" in lower:
            message = (
                "The request token is expired, already used, or from another login flow. "
                "Generate a new Kite login URL and sign in again."
            )
        elif "api key" in lower or "api secret" in lower:
            message = "The API key or API secret does not match this Kite app. Check both values."
        else:
            message = "Kite token exchange failed. Check the API key, API secret, and request-token freshness, then retry."
        raise HTTPException(status_code=401, detail=message) from exc
    access_token = session.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="Kite did not return an access token.")
    save_zerodha_token(access_token, api_key)
    return {"saved": True}


@app.get("/api/connection/status")
def connection_status() -> dict[str, object]:
    token = get_zerodha_token()
    configured = bool(token.get("access_token"))
    kite_source = next((source for source in get_sources() if source.source == SOURCE_NAME), None)
    if not configured:
        return {
            "provider": "zerodha_personal",
            "state": "not_configured",
            "token_configured": False,
            "market_data_provider": "yfinance",
            "market_data_permission_state": "pending_terms_review",
            "connected": False,
            "warnings": [
                "No Zerodha Personal token is configured yet. Broker reads are not active."
            ],
        }
    if kite_source:
        connected = kite_source.state == "connected"
        return {
            "provider": "zerodha_personal",
            "state": kite_source.state,
            "token_configured": True,
            "market_data_provider": "yfinance",
            "market_data_permission_state": "pending_terms_review",
            "connected": connected,
            "last_successful_refresh": kite_source.last_successful_refresh,
            "as_of": kite_source.as_of,
            "warnings": [kite_source.status_message] if kite_source.status_message else [],
        }
    return {
        "provider": "zerodha_personal",
        "state": "token_configured",
        "token_configured": True,
        "market_data_provider": "yfinance",
        "market_data_permission_state": "pending_terms_review",
        "connected": False,
        "warnings": [
            "A Kite token is saved. Sync the account to load the first local portfolio snapshot."
        ],
    }


@app.get("/api/preferences")
def read_preferences() -> dict[str, object]:
    return get_preferences().model_dump()


@app.put("/api/preferences")
def update_preferences(payload: Preferences) -> dict[str, object]:
    try:
        endpoint = validate_ollama_endpoint(payload.ollama_endpoint)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if payload.auto_sync_yfinance and not (
        payload.yfinance_sync_enabled and payload.yahoo_terms_confirmed
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Enable Yahoo price sync and confirm permitted automated use before "
                "enabling automatic downloads."
            ),
        )
    values = payload.model_dump()
    values["ollama_endpoint"] = endpoint
    return save_preferences(values).model_dump()


@app.get("/api/ai/models")
def ollama_models(endpoint: str | None = None) -> dict[str, object]:
    preferences = get_preferences()
    selected_endpoint = endpoint or preferences.ollama_endpoint
    try:
        models = installed_models(selected_endpoint)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OllamaUnavailable as exc:
        return {
            "available": False,
            "endpoint": selected_endpoint,
            "models": [],
            "message": str(exc),
        }
    return {
        "available": True,
        "endpoint": selected_endpoint,
        "models": models,
        "message": f"Found {len(models)} installed local models.",
    }


@app.post("/api/ai/recommendations")
def portfolio_recommendations() -> dict[str, object]:
    preferences = get_preferences()
    if not preferences.ollama_enabled:
        raise HTTPException(
            status_code=409,
            detail="Enable local AI insights in Settings before generating a review.",
        )
    holdings = get_holdings(include_manual=preferences.show_manual_imports)
    articles = get_news_articles(
        preferences.news_lookback_hours,
        preferences.news_max_articles,
    )
    try:
        report = generate_portfolio_insights(
            preferences.ollama_endpoint,
            preferences.ollama_model,
            holdings,
            articles,
        )
        return _finalize_ai_report(report, "portfolio", preferences, holdings, articles)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OllamaUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/ai/news-report")
def ai_news_report() -> dict[str, object]:
    preferences = get_preferences()
    if not preferences.ollama_enabled:
        raise HTTPException(
            status_code=409,
            detail="Enable local AI insights in Settings before generating a news report.",
        )
    articles = get_news_articles(
        preferences.news_lookback_hours,
        preferences.news_max_articles,
    )
    try:
        report = generate_news_report(
            preferences.ollama_endpoint,
            preferences.ollama_model,
            articles,
        )
        return _finalize_ai_report(report, "news", preferences, [], articles)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OllamaUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/ai/reports")
def ai_reports(
    report_type: str | None = Query(default=None, pattern="^(portfolio|news|ideas|risk|diversification|funds)$"),
    limit: int = Query(default=100, ge=1, le=250),
) -> dict[str, object]:
    return {"items": list_ai_reports(report_type=report_type, limit=limit)}


@app.post("/api/ai/ideas-report")
def ai_ideas_report() -> dict[str, object]:
    preferences = get_preferences()
    if not preferences.ollama_enabled:
        raise HTTPException(status_code=409, detail="Enable local AI insights in Settings before generating a research ideas report.")
    result = sync_idea_news(preferences.news_lookback_hours, preferences.news_max_articles)
    articles = result["items"]
    holdings = get_holdings(include_manual=preferences.show_manual_imports)
    try:
        report = generate_ideas_report(preferences.ollama_endpoint, preferences.ollama_model, articles, holdings)
        return _finalize_ai_report(report, "ideas", preferences, holdings, articles)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OllamaUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/ai/{report_type}-report")
def ai_typed_portfolio_report(report_type: str) -> dict[str, object]:
    if report_type not in {"risk", "diversification", "funds"}:
        raise HTTPException(status_code=404, detail="This report type is not available.")
    preferences = get_preferences()
    if not preferences.ollama_enabled:
        raise HTTPException(status_code=409, detail="Enable local AI insights in Settings before generating a report.")
    holdings = get_holdings(include_manual=preferences.show_manual_imports)
    articles = get_news_articles(preferences.news_lookback_hours, preferences.news_max_articles)
    try:
        report = generate_typed_portfolio_report(preferences.ollama_endpoint, preferences.ollama_model,
                                                 report_type, holdings, articles)
        return _finalize_ai_report(report, report_type, preferences, holdings, articles)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OllamaUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/ai/reports/{report_id}")
def ai_report(report_id: str) -> dict[str, object]:
    report = get_ai_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Saved AI report was not found.")
    return report


@app.get("/api/news")
def portfolio_news() -> dict[str, object]:
    preferences = get_preferences()
    return {
        "items": get_news_articles(
            preferences.news_lookback_hours,
            preferences.news_max_articles,
        )
    }


@app.post("/api/news/sync")
def refresh_portfolio_news() -> dict[str, object]:
    preferences = get_preferences()
    include_yahoo = preferences.yahoo_news_enabled and preferences.yahoo_terms_confirmed
    if not preferences.rss_news_enabled and not include_yahoo:
        raise HTTPException(
            status_code=409,
            detail=(
                "Enable market RSS news or enable Yahoo portfolio news and confirm its "
                "permitted access in Settings before refreshing headlines."
            ),
        )
    try:
        result = sync_portfolio_news(
            preferences.show_manual_imports,
            include_yahoo=include_yahoo,
            include_rss=preferences.rss_news_enabled,
            lookback_hours=preferences.news_lookback_hours,
            max_articles=preferences.news_max_articles,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {**result, "source_type": NEWS_SOURCE_TYPE}


@app.post("/api/market-data/sync")
def sync_market_data() -> dict[str, int | str | list[str]]:
    preferences = get_preferences()
    if not preferences.yfinance_sync_enabled or not preferences.yahoo_terms_confirmed:
        raise HTTPException(
            status_code=409,
            detail=(
                "Enable Yahoo Finance sync and confirm that automated use is permitted "
                "in Settings before downloading prices."
            ),
        )
    try:
        return sync_daily_prices()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The yfinance dependency is unavailable. Reinstall backend dependencies "
                "with `make setup`."
            ),
        ) from exc


@app.post("/api/portfolio/sync")
def sync_zerodha_portfolio() -> dict[str, int | str]:
    credentials = get_zerodha_token()
    api_key = credentials.get("api_key", "")
    access_token = credentials.get("access_token", "")
    if not api_key or not access_token:
        raise HTTPException(
            status_code=409,
            detail=(
                "A Zerodha API key and access token are required. "
                "Complete the Kite setup in the React dashboard Settings."
            ),
        )

    try:
        return sync_portfolio(api_key, access_token)
    except TokenException as exc:
        message = (
            "The saved Kite access token is expired or invalid. "
            "Generate a fresh token in the React dashboard Settings."
        )
        upsert_source_status(
            SOURCE_NAME,
            SOURCE_TYPE,
            "reauth_required",
            last_error=message,
            status_message=message,
        )
        raise HTTPException(status_code=401, detail=message) from exc
    except PermissionException as exc:
        message = (
            "Kite denied a portfolio read. Check that the Personal app and linked account "
            "are enabled."
        )
        upsert_source_status(
            SOURCE_NAME,
            SOURCE_TYPE,
            "invalid",
            last_error=message,
            status_message=message,
        )
        raise HTTPException(status_code=403, detail=message) from exc
    except NetworkException as exc:
        message = "Kite could not be reached. The last successful local snapshot has been kept."
        upsert_source_status(
            SOURCE_NAME,
            SOURCE_TYPE,
            "stale",
            last_error=message,
            status_message=message,
        )
        raise HTTPException(status_code=503, detail=message) from exc
    except KiteException as exc:
        message = (
            "Kite returned an error while syncing. "
            "The last successful local snapshot has been kept."
        )
        upsert_source_status(
            SOURCE_NAME,
            SOURCE_TYPE,
            "stale",
            last_error=message,
            status_message=message,
        )
        raise HTTPException(status_code=502, detail=message) from exc
    except (ValueError, TypeError, KeyError) as exc:
        message = (
            "Kite returned data the portfolio sync could not interpret. "
            "The last successful local snapshot has been kept."
        )
        upsert_source_status(
            SOURCE_NAME,
            SOURCE_TYPE,
            "invalid",
            last_error=message,
            status_message=message,
        )
        raise HTTPException(status_code=502, detail=message) from exc


@app.get("/api/portfolio/summary")
def portfolio_summary() -> dict:
    preferences = get_preferences()
    token = get_zerodha_token()
    visible_holdings = get_holdings(include_manual=preferences.show_manual_imports)
    if not token.get("access_token") and not visible_holdings:
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
                "Zerodha access token is not configured yet. Use React dashboard Settings "
                "to generate and save it."
            ],
            "message": "Setup required",
        }
    return calculate_summary(include_manual=preferences.show_manual_imports).model_dump(mode="json")


@app.get("/api/portfolio/holdings")
def portfolio_holdings() -> dict[str, list[dict]]:
    preferences = get_preferences()
    return {
        "items": [
            holding.model_dump(mode="json")
            for holding in get_holdings(include_manual=preferences.show_manual_imports)
        ]
    }


@app.get("/api/portfolio/allocations")
def portfolio_allocations() -> list[dict]:
    preferences = get_preferences()
    return [
        bucket.model_dump(mode="json")
        for bucket in calculate_allocations(include_manual=preferences.show_manual_imports)
    ]


@app.get("/api/sources")
def collection_sources() -> dict[str, list[dict]]:
    preferences = get_preferences()
    return {
        "items": [
            source.model_dump(mode="json")
            for source in get_sources(include_manual=preferences.show_manual_imports)
        ]
    }


@app.get("/api/portfolio/export")
def export_portfolio_csv() -> dict[str, str]:
    preferences = get_preferences()
    holdings = get_holdings(include_manual=preferences.show_manual_imports)
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
        "price_as_of",
        "price_source",
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
            holding.price_as_of.isoformat() if holding.price_as_of else "",
            holding.price_source,
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
    refresh_manual_sip_entries()
    preferences = get_preferences()
    return {
        "items": [
            sip.model_dump(mode="json")
            for sip in get_sips(include_manual=preferences.show_manual_imports)
        ]
    }


@app.get("/api/manual-sips")
def manual_sips() -> dict[str, list[dict[str, object]]]:
    refresh_manual_sip_entries()
    return {"items": list_manual_sip_schedules()}


@app.post("/api/manual-sips")
def create_manual_sip(payload: ManualSipScheduleInput) -> dict[str, object]:
    schedule_id = save_manual_sip_schedule(payload)
    refresh_manual_sip_entries()
    return {"id": schedule_id, "items": list_manual_sip_schedules()}


@app.put("/api/manual-sips/{schedule_id}")
def update_manual_sip(
    schedule_id: str, payload: ManualSipScheduleInput
) -> dict[str, object]:
    try:
        save_manual_sip_schedule(payload, schedule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Manual SIP schedule not found.") from exc
    refresh_manual_sip_entries()
    return {"items": list_manual_sip_schedules()}


@app.patch("/api/manual-sips/{schedule_id}/enabled")
def toggle_manual_sip(schedule_id: str, payload: dict[str, bool]) -> dict[str, object]:
    if "enabled" not in payload:
        raise HTTPException(status_code=422, detail="enabled is required.")
    if not set_manual_sip_enabled(schedule_id, payload["enabled"]):
        raise HTTPException(status_code=404, detail="Manual SIP schedule not found.")
    return {"items": list_manual_sip_schedules()}


@app.patch("/api/manual-sips/entries/{entry_id}")
def update_manual_sip_entry(
    entry_id: str, payload: ManualSipEntryStatus
) -> dict[str, bool]:
    if not set_manual_sip_entry_status(entry_id, payload.status):
        raise HTTPException(status_code=404, detail="Manual SIP entry not found.")
    return {"saved": True}


@app.get("/api/manual-portfolio")
def manual_portfolio() -> dict[str, list[dict[str, object]]]:
    return {"items": list_manual_positions()}


@app.put("/api/manual-portfolio")
def save_manual_portfolio(items: list[ManualPositionInput]) -> dict[str, object]:
    saved = save_manual_positions(items)
    return {"saved": saved, "items": list_manual_positions()}


@app.patch("/api/manual-portfolio/bulk")
def bulk_edit_portfolio(payload: ManualPositionBulkEdit) -> dict[str, int]:
    if payload.source is not None and not payload.source.strip():
        raise HTTPException(status_code=422, detail="Source cannot be blank.")
    changed = bulk_edit_manual_positions(
        payload.ids,
        market=payload.market,
        source=payload.source.strip() if payload.source is not None else None,
        asset_type=payload.asset_type,
    )
    return {"updated": changed}


@app.post("/api/manual-portfolio/bulk-delete")
def bulk_delete_portfolio(payload: ManualPositionIds) -> dict[str, int]:
    return {"deleted": delete_manual_positions(payload.ids)}


@app.get("/api/manual-portfolio/export")
def export_manual_portfolio() -> Response:
    output = io.StringIO()
    fields = ["ticker", "units", "market", "buy_price", "current_price", "source", "asset_type"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for item in list_manual_positions():
        writer.writerow({field: item.get(field) for field in fields})
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="manual-portfolio.csv"'},
    )


@app.post("/api/manual-portfolio/import")
def import_manual_portfolio(payload: ManualPositionImport) -> dict[str, object]:
    reader = csv.DictReader(io.StringIO(payload.csv_text.removeprefix("\ufeff")))
    required = {"ticker", "units", "market", "buy_price", "source", "asset_type"}
    headers = {name.strip().lower() for name in reader.fieldnames or []}
    if not required.issubset(headers):
        missing = ", ".join(sorted(required - headers))
        raise HTTPException(status_code=422, detail=f"CSV is missing required columns: {missing}")
    rows: list[ManualPositionInput] = []
    errors: list[str] = []
    for line_number, raw_row in enumerate(reader, start=2):
        row = {
            str(key).strip().lower(): (value or "").strip()
            for key, value in raw_row.items()
            if key
        }
        try:
            rows.append(
                ManualPositionInput(
                    ticker=row.get("ticker", ""),
                    units=float(row.get("units", "")),
                    market=row.get("market", "").upper(),
                    buy_price=float(row.get("buy_price", "")),
                    current_price=float(row["current_price"]) if row.get("current_price") else None,
                    source=row.get("source", ""),
                    asset_type=row.get("asset_type", "").lower(),
                )
            )
        except (ValueError, TypeError) as exc:
            errors.append(f"Row {line_number}: invalid field value ({exc}).")
    if not rows:
        raise HTTPException(status_code=422, detail="No valid position rows were found in the CSV.")
    if payload.replace_existing and errors:
        raise HTTPException(
            status_code=422,
            detail=f"Replace was cancelled because {len(errors)} CSV row(s) are invalid.",
        )
    imported = import_manual_positions(rows, payload.replace_existing)
    return {"imported": imported, "skipped": len(errors), "warnings": errors[:50]}
