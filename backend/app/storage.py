from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .models import (
    AllocationBucket,
    Holding,
    ManualPositionInput,
    PortfolioSummary,
    Preferences,
    Sip,
    SourceStatus,
)
from .secrets import delete_secret, get_secret, save_secret

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "portfolio_puffin.db"


def _utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _from_db(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value)


def get_db_path() -> Path:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(get_db_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def save_app_setting(key: str, value: str) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, value, _utc_iso(datetime.now(UTC))),
        )


def get_app_setting(key: str) -> str | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT value FROM app_settings WHERE key = ?",
            (key,),
        ).fetchone()
    return row["value"] if row else None


def _migrate_legacy_tokens() -> None:
    legacy_access = get_app_setting("zerodha_access_token")
    legacy_api_key = get_app_setting("zerodha_api_key")
    if legacy_access:
        save_secret("zerodha_access_token", legacy_access)
    if legacy_api_key:
        save_secret("zerodha_api_key", legacy_api_key)
    if legacy_access or legacy_api_key:
        with get_connection() as connection:
            connection.execute(
                "DELETE FROM app_settings WHERE key IN (?, ?)",
                ("zerodha_access_token", "zerodha_api_key"),
            )


def initialize_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sources (
                source_name TEXT PRIMARY KEY,
                source_type TEXT NOT NULL,
                state TEXT NOT NULL,
                last_successful_refresh TEXT,
                last_attempted_refresh TEXT,
                last_error TEXT,
                currency TEXT NOT NULL DEFAULT 'INR',
                as_of TEXT,
                status_message TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS holdings (
                id TEXT PRIMARY KEY,
                instrument_name TEXT NOT NULL,
                asset_class TEXT NOT NULL,
                symbol TEXT,
                quantity REAL,
                average_cost REAL,
                last_price REAL,
                value REAL,
                pnl REAL,
                price_as_of TEXT,
                price_source TEXT,
                currency TEXT NOT NULL DEFAULT 'INR',
                source_name TEXT NOT NULL,
                as_of TEXT NOT NULL
            )
            """
        )
        holding_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(holdings)").fetchall()
        }
        if "price_as_of" not in holding_columns:
            connection.execute("ALTER TABLE holdings ADD COLUMN price_as_of TEXT")
        if "price_source" not in holding_columns:
            connection.execute("ALTER TABLE holdings ADD COLUMN price_source TEXT")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS manual_positions (
                id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                units REAL NOT NULL,
                market TEXT NOT NULL,
                buy_price REAL NOT NULL,
                current_price REAL,
                price_as_of TEXT,
                price_source TEXT,
                source TEXT NOT NULL,
                asset_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS news_articles (
                id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                instrument_name TEXT NOT NULL,
                asset_type TEXT NOT NULL,
                title TEXT NOT NULL,
                publisher TEXT,
                summary TEXT,
                url TEXT,
                published_at TEXT,
                fetched_at TEXT NOT NULL,
                source_key TEXT NOT NULL DEFAULT 'yahoo',
                related_tickers TEXT NOT NULL DEFAULT '[]'
            )
            """
        )
        news_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(news_articles)").fetchall()
        }
        if "source_key" not in news_columns:
            connection.execute(
                "ALTER TABLE news_articles ADD COLUMN source_key TEXT NOT NULL DEFAULT 'yahoo'"
            )
        if "related_tickers" not in news_columns:
            connection.execute(
                "ALTER TABLE news_articles ADD COLUMN related_tickers TEXT NOT NULL DEFAULT '[]'"
            )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS news_source_meta (
                source_key TEXT PRIMARY KEY,
                last_fetched_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_reports (
                report_id TEXT PRIMARY KEY,
                report_type TEXT NOT NULL,
                model TEXT NOT NULL,
                markdown TEXT NOT NULL,
                generated_at TEXT,
                saved_at TEXT NOT NULL,
                scope TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sips (
                id TEXT PRIMARY KEY,
                scheme_name TEXT NOT NULL,
                amount REAL,
                frequency TEXT,
                next_date TEXT,
                status TEXT,
                source_name TEXT NOT NULL,
                as_of TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS imports (
                id TEXT PRIMARY KEY,
                source_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                parser_version TEXT NOT NULL,
                row_count INTEGER NOT NULL,
                validation_outcome TEXT NOT NULL,
                warnings TEXT NOT NULL DEFAULT '[]'
            )
            """
        )
    _migrate_legacy_tokens()


def get_preferences() -> Preferences:
    defaults = Preferences()
    with get_connection() as connection:
        rows = connection.execute("SELECT key, value FROM preferences").fetchall()
    values = defaults.model_dump()
    values["ollama_endpoint"] = os.environ.get(
        "LLM_BASE_URL", values["ollama_endpoint"]
    )
    values["ollama_model"] = os.environ.get("LLM_MODEL", values["ollama_model"])
    for row in rows:
        try:
            values[row["key"]] = json.loads(row["value"])
        except (TypeError, ValueError):
            continue
    return Preferences.model_validate(values)


def save_preferences(values: dict[str, object]) -> Preferences:
    known = set(Preferences.model_fields)
    now = _utc_iso(datetime.now(UTC))
    with get_connection() as connection:
        for key, value in values.items():
            if key not in known:
                continue
            connection.execute(
                """
                INSERT INTO preferences (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (key, json.dumps(value), now),
            )
    return get_preferences()


def save_zerodha_token(access_token: str, api_key: str | None = None) -> None:
    save_secret("zerodha_access_token", access_token)
    if api_key:
        save_secret("zerodha_api_key", api_key)


def get_zerodha_token() -> dict[str, str]:
    legacy_access = get_app_setting("zerodha_access_token")
    legacy_api_key = get_app_setting("zerodha_api_key")
    if legacy_access or legacy_api_key:
        _migrate_legacy_tokens()
    return {
        "access_token": get_secret("zerodha_access_token"),
        "api_key": get_secret("zerodha_api_key"),
    }


def delete_zerodha_token() -> None:
    delete_secret("zerodha_access_token")
    delete_secret("zerodha_api_key")
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM app_settings WHERE key IN (?, ?)",
            ("zerodha_access_token", "zerodha_api_key"),
        )


def upsert_source_status(
    source_name: str,
    source_type: str,
    state: str,
    *,
    currency: str = "INR",
    as_of: datetime | None = None,
    last_error: str | None = None,
    status_message: str | None = None,
) -> None:
    now = datetime.now(UTC)
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO sources (
                source_name,
                source_type,
                state,
                last_successful_refresh,
                last_attempted_refresh,
                last_error,
                currency,
                as_of,
                status_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_name) DO UPDATE SET
                source_type = excluded.source_type,
                state = excluded.state,
                last_successful_refresh = COALESCE(
                    excluded.last_successful_refresh,
                    sources.last_successful_refresh
                ),
                last_attempted_refresh = excluded.last_attempted_refresh,
                last_error = excluded.last_error,
                currency = excluded.currency,
                as_of = COALESCE(excluded.as_of, sources.as_of),
                status_message = excluded.status_message
            """,
            (
                source_name,
                source_type,
                state,
                _utc_iso(now) if state == "connected" else None,
                _utc_iso(now),
                last_error,
                currency,
                _utc_iso(as_of),
                status_message,
            ),
        )


def _is_manual_source(source_name: str) -> bool:
    normalized = source_name.casefold()
    manual_names = {"manual", "manual-import", "csv-import", "sample-import"}
    return (
        normalized in manual_names
        or normalized.startswith("manual-")
        or normalized.startswith("manual · ")
    )


def list_manual_positions() -> list[dict[str, object]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM manual_positions ORDER BY ticker COLLATE NOCASE, source COLLATE NOCASE"
        ).fetchall()
    return [dict(row) for row in rows]


def manual_positions_as_holdings() -> list[Holding]:
    holdings: list[Holding] = []
    for row in list_manual_positions():
        units = float(row["units"])
        price = row["current_price"]
        basis = float(row["buy_price"])
        asset_type = str(row["asset_type"])
        holdings.append(
            Holding(
                id=f"manual-position:{row['id']}",
                instrument_name=str(row["ticker"]),
                asset_class={"stock": "equity", "mf": "mutual_fund"}.get(
                    asset_type, asset_type
                ),
                symbol=str(row["ticker"]),
                quantity=units,
                average_cost=basis,
                last_price=float(price) if price is not None else None,
                value=float(price) * units if price is not None else None,
                pnl=(float(price) - basis) * units if price is not None else None,
                price_as_of=_from_db(row["price_as_of"]),
                price_source=row["price_source"],
                currency="USD" if row["market"] == "NYSE" else "INR",
                source=f"Manual · {row['source']}",
                as_of=_from_db(row["updated_at"]),
            )
        )
    return holdings


def save_manual_positions(items: list[ManualPositionInput]) -> int:
    now = _utc_iso(datetime.now(UTC))
    with get_connection() as connection:
        for item in items:
            _upsert_manual_position(connection, item, now)
    return len(items)


def _upsert_manual_position(
    connection: sqlite3.Connection, item: ManualPositionInput, now: str | None
) -> None:
    position_id = item.id or str(uuid.uuid4())
    connection.execute(
        """
        INSERT INTO manual_positions (
            id, ticker, units, market, buy_price, current_price, source,
            asset_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            current_price = CASE
                WHEN manual_positions.ticker != excluded.ticker
                    OR manual_positions.market != excluded.market
                THEN NULL
                ELSE excluded.current_price
            END,
            price_as_of = CASE
                WHEN manual_positions.ticker != excluded.ticker
                    OR manual_positions.market != excluded.market
                THEN NULL
                ELSE manual_positions.price_as_of
            END,
            price_source = CASE
                WHEN manual_positions.ticker != excluded.ticker
                    OR manual_positions.market != excluded.market
                THEN NULL
                ELSE manual_positions.price_source
            END,
            ticker = excluded.ticker,
            units = excluded.units,
            market = excluded.market,
            buy_price = excluded.buy_price,
            source = excluded.source,
            asset_type = excluded.asset_type,
            updated_at = excluded.updated_at
        """,
        (
            position_id,
            item.ticker.strip().upper(),
            item.units,
            item.market,
            item.buy_price,
            item.current_price,
            item.source.strip(),
            item.asset_type,
            now,
            now,
        ),
    )


def bulk_edit_manual_positions(
    ids: list[str], *, market: str | None, source: str | None, asset_type: str | None
) -> int:
    changes = {"market": market, "source": source, "asset_type": asset_type}
    changes = {key: value for key, value in changes.items() if value is not None}
    if not changes:
        return 0
    assignments = ", ".join(f"{key} = ?" for key in changes)
    if market is not None:
        assignments += ", current_price = NULL, price_as_of = NULL, price_source = NULL"
    placeholders = ", ".join("?" for _ in ids)
    values = list(changes.values()) + [_utc_iso(datetime.now(UTC)), *ids]
    with get_connection() as connection:
        cursor = connection.execute(
            f"UPDATE manual_positions SET {assignments}, updated_at = ? "
            f"WHERE id IN ({placeholders})",
            values,
        )
    return cursor.rowcount


def delete_manual_positions(ids: list[str] | None = None) -> int:
    with get_connection() as connection:
        if ids is None:
            cursor = connection.execute("DELETE FROM manual_positions")
        elif ids:
            placeholders = ", ".join("?" for _ in ids)
            cursor = connection.execute(
                f"DELETE FROM manual_positions WHERE id IN ({placeholders})", ids
            )
        else:
            return 0
    return cursor.rowcount


def get_news_articles(
    lookback_hours: int = 720, max_articles: int = 200
) -> list[dict[str, object]]:
    cutoff = _utc_iso(datetime.now(UTC) - timedelta(hours=lookback_hours))
    with get_connection() as connection:
        rows = connection.execute(
            """SELECT * FROM news_articles
               WHERE COALESCE(published_at, fetched_at) >= ?
               ORDER BY COALESCE(published_at, fetched_at) DESC
               LIMIT ?""",
            (cutoff, max_articles),
        ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        try:
            item["related_tickers"] = json.loads(item.get("related_tickers") or "[]")
        except (TypeError, ValueError):
            item["related_tickers"] = []
        items.append(item)
    return items


def news_source_is_fresh(source_key: str, ttl_minutes: int = 30) -> bool:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT last_fetched_at FROM news_source_meta WHERE source_key = ?",
            (source_key,),
        ).fetchone()
    if not row:
        return False
    try:
        fetched = datetime.fromisoformat(row["last_fetched_at"].replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return False
    return (datetime.now(UTC) - fetched.astimezone(UTC)).total_seconds() < ttl_minutes * 60


def mark_news_source_fetched(source_key: str) -> None:
    with get_connection() as connection:
        connection.execute(
            """INSERT INTO news_source_meta(source_key, last_fetched_at) VALUES (?, ?)
               ON CONFLICT(source_key) DO UPDATE SET last_fetched_at = excluded.last_fetched_at""",
            (source_key, _utc_iso(datetime.now(UTC))),
        )


def upsert_news_articles(items: list[dict[str, object]]) -> int:
    with get_connection() as connection:
        for item in items:
            old = connection.execute(
                "SELECT related_tickers FROM news_articles WHERE id = ?",
                (item["id"],),
            ).fetchone()
            related_tickers = set(item.get("related_tickers", []))
            if old:
                try:
                    related_tickers.update(json.loads(old["related_tickers"] or "[]"))
                except (TypeError, ValueError):
                    pass
            connection.execute(
                """INSERT INTO news_articles (
                id, ticker, instrument_name, asset_type, title, publisher, summary,
                url, published_at, fetched_at, source_key, related_tickers
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                ticker = excluded.ticker,
                instrument_name = excluded.instrument_name,
                asset_type = excluded.asset_type,
                title = excluded.title,
                publisher = excluded.publisher,
                summary = COALESCE(excluded.summary, news_articles.summary),
                url = COALESCE(excluded.url, news_articles.url),
                published_at = COALESCE(excluded.published_at, news_articles.published_at),
                fetched_at = excluded.fetched_at,
                related_tickers = excluded.related_tickers""",
                (
                    item["id"], item["ticker"], item["instrument_name"],
                    item["asset_type"], item["title"], item.get("publisher"),
                    item.get("summary"), item.get("url"), item.get("published_at"),
                    item["fetched_at"], item.get("source_key", "yahoo"),
                    json.dumps(sorted(related_tickers)),
                ),
            )
    return len(items)


def prune_news_articles(retention_days: int = 30) -> int:
    cutoff = _utc_iso(datetime.now(UTC) - timedelta(days=retention_days))
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM news_articles WHERE COALESCE(published_at, fetched_at) < ?",
            (cutoff,),
        )
    return cursor.rowcount


def save_ai_report(
    report_type: str,
    model: str,
    markdown: str,
    generated_at: str | None,
    scope: str,
) -> dict[str, object]:
    report = {
        "report_id": str(uuid.uuid4()),
        "report_type": report_type,
        "model": model,
        "markdown": markdown,
        "generated_at": generated_at,
        "saved_at": _utc_iso(datetime.now(UTC)),
        "scope": scope,
    }
    with get_connection() as connection:
        connection.execute(
            """INSERT INTO ai_reports (
                   report_id, report_type, model, markdown, generated_at, saved_at, scope
               ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
            tuple(report.values()),
        )
    return report


def list_ai_reports(
    report_type: str | None = None, limit: int = 100
) -> list[dict[str, object]]:
    query = """SELECT report_id, report_type, model, generated_at, saved_at, scope
               FROM ai_reports"""
    parameters: list[object] = []
    if report_type:
        query += " WHERE report_type = ?"
        parameters.append(report_type)
    query += " ORDER BY saved_at DESC LIMIT ?"
    parameters.append(limit)
    with get_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [dict(row) for row in rows]


def get_ai_report(report_id: str) -> dict[str, object] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM ai_reports WHERE report_id = ?", (report_id,)
        ).fetchone()
    return dict(row) if row else None


def import_manual_positions(items: list[ManualPositionInput], replace_existing: bool) -> int:
    now = _utc_iso(datetime.now(UTC))
    with get_connection() as connection:
        if replace_existing:
            connection.execute("DELETE FROM manual_positions")
        for item in items:
            _upsert_manual_position(connection, item.model_copy(update={"id": None}), now)
    return len(items)


def get_sources(include_manual: bool = True) -> list[SourceStatus]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                source_name,
                source_type,
                state,
                last_successful_refresh,
                last_attempted_refresh,
                last_error,
                currency,
                as_of,
                status_message
            FROM sources
            ORDER BY source_name
            """
        ).fetchall()
    sources = [
        SourceStatus(
            source=row["source_name"],
            source_type=row["source_type"],
            state=row["state"],
            last_successful_refresh=_from_db(row["last_successful_refresh"]),
            last_attempted_refresh=_from_db(row["last_attempted_refresh"]),
            last_error=row["last_error"],
            currency=row["currency"],
            as_of=_from_db(row["as_of"]),
            status_message=row["status_message"],
        )
        for row in rows
    ]
    return [source for source in sources if include_manual or not _is_manual_source(source.source)]


def get_holdings(include_manual: bool = True) -> list[Holding]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                instrument_name,
                asset_class,
                symbol,
                quantity,
                average_cost,
                last_price,
                value,
                pnl,
                price_as_of,
                price_source,
                currency,
                source_name,
                as_of
            FROM holdings
            ORDER BY instrument_name
            """
        ).fetchall()
    holdings = [
        Holding(
            id=row["id"],
            instrument_name=row["instrument_name"],
            asset_class=row["asset_class"],
            symbol=row["symbol"],
            quantity=row["quantity"],
            average_cost=row["average_cost"],
            last_price=row["last_price"],
            value=row["value"],
            pnl=row["pnl"],
            price_as_of=_from_db(row["price_as_of"]),
            price_source=row["price_source"],
            currency=row["currency"],
            source=row["source_name"],
            as_of=_from_db(row["as_of"]),
        )
        for row in rows
    ]
    if include_manual:
        holdings.extend(manual_positions_as_holdings())
    return [
        holding
        for holding in holdings
        if include_manual or not _is_manual_source(holding.source)
    ]


def get_sips(include_manual: bool = True) -> list[Sip]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                scheme_name,
                amount,
                frequency,
                next_date,
                status,
                source_name,
                as_of
            FROM sips
            ORDER BY scheme_name
            """
        ).fetchall()
    sips = [
        Sip(
            id=row["id"],
            scheme_name=row["scheme_name"],
            amount=row["amount"],
            frequency=row["frequency"],
            next_date=_from_db(row["next_date"]),
            status=row["status"],
            source=row["source_name"],
            as_of=_from_db(row["as_of"]),
        )
        for row in rows
    ]
    return [sip for sip in sips if include_manual or not _is_manual_source(sip.source)]


def calculate_summary(include_manual: bool = True) -> PortfolioSummary:
    rows = get_holdings(include_manual=include_manual)
    if not rows:
        return PortfolioSummary(
            total_value=None,
            day_change=None,
            invested=None,
            pnl=None,
            currency="INR",
            as_of=None,
            status="empty",
            sources=get_sources(include_manual=include_manual),
            warnings=["No holdings have been imported yet."],
        )

    inr_rows = [holding for holding in rows if holding.currency == "INR"]
    total_value = sum(
        (holding.value for holding in inr_rows if holding.value is not None),
        0.0,
    )
    invested = sum(
        (
            (holding.quantity or 0.0) * (holding.average_cost or 0.0)
            for holding in inr_rows
            if holding.quantity is not None and holding.average_cost is not None
        ),
        0.0,
    )
    pnl = sum((holding.pnl for holding in inr_rows if holding.pnl is not None), 0.0)
    as_of = max(
        (holding.as_of for holding in inr_rows if holding.as_of is not None),
        default=None,
    )

    status = "ready"
    warnings: list[str] = []
    if any(holding.value is None or holding.as_of is None for holding in rows):
        status = "partial"
        warnings.append("Some holdings are missing a value or as-of timestamp.")
    if any(holding.last_price is None for holding in rows):
        warnings.append("Some prices are unavailable.")
    if len(inr_rows) != len(rows):
        status = "partial"
        warnings.append(
            "Non-INR holdings are excluded from INR totals until currency conversion is configured."
        )

    return PortfolioSummary(
        total_value=total_value if total_value else None,
        day_change=None,
        invested=invested if invested else None,
        pnl=pnl if pnl else None,
        currency="INR",
        as_of=as_of,
        status=status,
        sources=get_sources(include_manual=include_manual),
        warnings=warnings,
    )


def calculate_allocations(include_manual: bool = True) -> list[AllocationBucket]:
    holdings = [
        holding
        for holding in get_holdings(include_manual=include_manual)
        if holding.currency == "INR"
    ]
    if not holdings:
        return []

    grouped: dict[str, float] = {}
    for holding in holdings:
        if holding.value is None:
            continue
        grouped[holding.asset_class] = grouped.get(holding.asset_class, 0.0) + holding.value

    total = sum(grouped.values())
    if total == 0:
        return []

    return [
        AllocationBucket(
            asset_class=asset_class,
            value=value,
            percentage=(value / total) * 100,
        )
        for asset_class, value in sorted(grouped.items())
    ]


def insert_import_record(
    source_type: str,
    row_count: int,
    validation_outcome: str,
    warnings: list[str],
) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO imports (
                id,
                source_type,
                created_at,
                parser_version,
                row_count,
                validation_outcome,
                warnings
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                source_type,
                _utc_iso(datetime.now(UTC)),
                "1.0",
                row_count,
                validation_outcome,
                json.dumps(warnings),
            ),
        )


def persist_holdings(rows: list[dict], source_name: str) -> int:
    if not rows:
        return 0

    with get_connection() as connection:
        for row in rows:
            item = {
                "id": row.get("id") or str(uuid.uuid4()),
                "instrument_name": (
                    row.get("instrument_name")
                    or row.get("symbol")
                    or "Unknown holding"
                ),
                "asset_class": row.get("asset_class") or "equity",
                "symbol": row.get("symbol"),
                "quantity": _coerce_float(row.get("quantity")),
                "average_cost": _coerce_float(row.get("average_cost")),
                "last_price": _coerce_float(row.get("last_price")),
                "value": _coerce_float(row.get("value")),
                "pnl": _coerce_float(row.get("pnl")),
                "price_as_of": _utc_iso(_coerce_datetime(row.get("price_as_of"))),
                "price_source": row.get("price_source") or source_name,
                "currency": row.get("currency") or "INR",
                "source_name": source_name,
                "as_of": (
                    _utc_iso(_coerce_datetime(row.get("as_of")))
                    or _utc_iso(datetime.now(UTC))
                ),
            }
            connection.execute(
                """
                INSERT INTO holdings (
                    id,
                    instrument_name,
                    asset_class,
                    symbol,
                    quantity,
                    average_cost,
                    last_price,
                    value,
                    pnl,
                    price_as_of,
                    price_source,
                    currency,
                    source_name,
                    as_of
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    instrument_name = excluded.instrument_name,
                    asset_class = excluded.asset_class,
                    symbol = excluded.symbol,
                    quantity = excluded.quantity,
                    average_cost = excluded.average_cost,
                    last_price = excluded.last_price,
                    value = excluded.value,
                    pnl = excluded.pnl,
                    price_as_of = excluded.price_as_of,
                    price_source = excluded.price_source,
                    currency = excluded.currency,
                    source_name = excluded.source_name,
                    as_of = excluded.as_of
                """,
                (
                    item["id"],
                    item["instrument_name"],
                    item["asset_class"],
                    item["symbol"],
                    item["quantity"],
                    item["average_cost"],
                    item["last_price"],
                    item["value"],
                    item["pnl"],
                    item["price_as_of"],
                    item["price_source"],
                    item["currency"],
                    item["source_name"],
                    item["as_of"],
                ),
            )
    return len(rows)


def persist_sips(rows: list[dict], source_name: str) -> int:
    if not rows:
        return 0

    with get_connection() as connection:
        for row in rows:
            scheme_name = row.get("scheme_name") or row.get("name") or "Unknown SIP"
            as_of = (
                _utc_iso(_coerce_datetime(row.get("as_of")))
                or _utc_iso(datetime.now(UTC))
            )
            connection.execute(
                """
                INSERT INTO sips (
                    id,
                    scheme_name,
                    amount,
                    frequency,
                    next_date,
                    status,
                    source_name,
                    as_of
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    scheme_name = excluded.scheme_name,
                    amount = excluded.amount,
                    frequency = excluded.frequency,
                    next_date = excluded.next_date,
                    status = excluded.status,
                    source_name = excluded.source_name,
                    as_of = excluded.as_of
                """,
                (
                    row.get("id") or str(uuid.uuid4()),
                    scheme_name,
                    _coerce_float(row.get("amount")),
                    row.get("frequency"),
                    _utc_iso(_coerce_datetime(row.get("next_date"))),
                    row.get("status"),
                    source_name,
                    as_of,
                ),
            )
    return len(rows)


def replace_source_snapshot(
    holding_rows: list[dict],
    sip_rows: list[dict],
    source_name: str,
) -> tuple[int, int]:
    """Atomically replace one broker's latest holdings and SIP snapshot."""
    now = _utc_iso(datetime.now(UTC))
    with get_connection() as connection:
        connection.execute("DELETE FROM holdings WHERE source_name = ?", (source_name,))
        connection.execute("DELETE FROM sips WHERE source_name = ?", (source_name,))

        for row in holding_rows:
            connection.execute(
                """
                INSERT INTO holdings (
                    id, instrument_name, asset_class, symbol, quantity, average_cost,
                    last_price, value, pnl, price_as_of, price_source, currency, source_name, as_of
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    row["instrument_name"],
                    row["asset_class"],
                    row.get("symbol"),
                    _coerce_float(row.get("quantity")),
                    _coerce_float(row.get("average_cost")),
                    _coerce_float(row.get("last_price")),
                    _coerce_float(row.get("value")),
                    _coerce_float(row.get("pnl")),
                    _utc_iso(_coerce_datetime(row.get("price_as_of"))),
                    row.get("price_source") or source_name,
                    row.get("currency") or "INR",
                    source_name,
                    _utc_iso(_coerce_datetime(row.get("as_of"))) or now,
                ),
            )

        for row in sip_rows:
            connection.execute(
                """
                INSERT INTO sips (
                    id, scheme_name, amount, frequency, next_date, status, source_name, as_of
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    row["scheme_name"],
                    _coerce_float(row.get("amount")),
                    row.get("frequency"),
                    _utc_iso(_coerce_datetime(row.get("next_date"))),
                    row.get("status"),
                    source_name,
                    _utc_iso(_coerce_datetime(row.get("as_of"))) or now,
                ),
            )

    return len(holding_rows), len(sip_rows)


def update_market_prices(prices: dict[str, dict[str, object]], source: str) -> int:
    updated = 0
    with get_connection() as connection:
        for holding_id, quote in prices.items():
            close = _coerce_float(quote.get("close"))
            price_date = _utc_iso(_coerce_datetime(quote.get("price_as_of")))
            if close is None or price_date is None:
                continue
            if holding_id.startswith("manual-position:"):
                cursor = connection.execute(
                    """UPDATE manual_positions SET current_price = ?, price_as_of = ?,
                       price_source = ?, updated_at = ? WHERE id = ?""",
                    (
                        close,
                        price_date,
                        source,
                        _utc_iso(datetime.now(UTC)),
                        holding_id.removeprefix("manual-position:"),
                    ),
                )
                updated += cursor.rowcount
                continue
            cursor = connection.execute(
                """
                UPDATE holdings
                SET last_price = ?,
                    value = quantity * ?,
                    pnl = CASE
                        WHEN average_cost IS NOT NULL THEN (?-average_cost)*quantity
                        ELSE pnl
                    END,
                    price_as_of = ?,
                    price_source = ?
                WHERE id = ? AND asset_class = 'equity'
                """,
                (close, close, close, price_date, source, holding_id),
            )
            updated += cursor.rowcount
    return updated


def clear_local_data() -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM holdings")
        connection.execute("DELETE FROM sips")
        connection.execute("DELETE FROM sources")
        connection.execute("DELETE FROM imports")
        connection.execute("DELETE FROM preferences")
        connection.execute("DELETE FROM manual_positions")
        connection.execute("DELETE FROM news_articles")
        connection.execute("DELETE FROM news_source_meta")
        connection.execute("DELETE FROM ai_reports")
        connection.execute("DELETE FROM app_settings")


def _coerce_float(value: object) -> float | None:
    if value in (None, "", "N/A"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_datetime(value: object) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None
