from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .models import AllocationBucket, Holding, PortfolioSummary, Sip, SourceStatus
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
                currency TEXT NOT NULL DEFAULT 'INR',
                source_name TEXT NOT NULL,
                as_of TEXT NOT NULL
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
                as_of = excluded.as_of,
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


def get_sources() -> list[SourceStatus]:
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
    return [
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


def get_holdings() -> list[Holding]:
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
                currency,
                source_name,
                as_of
            FROM holdings
            ORDER BY instrument_name
            """
        ).fetchall()
    return [
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
            currency=row["currency"],
            source=row["source_name"],
            as_of=_from_db(row["as_of"]),
        )
        for row in rows
    ]


def get_sips() -> list[Sip]:
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
    return [
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


def calculate_summary() -> PortfolioSummary:
    rows = get_holdings()
    if not rows:
        return PortfolioSummary(
            total_value=None,
            day_change=None,
            invested=None,
            pnl=None,
            currency="INR",
            as_of=None,
            status="empty",
            sources=get_sources(),
            warnings=["No holdings have been imported yet."],
        )

    total_value = sum(
        (holding.value for holding in rows if holding.value is not None),
        0.0,
    )
    invested = sum(
        (
            (holding.quantity or 0.0) * (holding.average_cost or 0.0)
            for holding in rows
            if holding.quantity is not None and holding.average_cost is not None
        ),
        0.0,
    )
    pnl = sum((holding.pnl for holding in rows if holding.pnl is not None), 0.0)
    as_of = max(
        (holding.as_of for holding in rows if holding.as_of is not None),
        default=None,
    )

    status = "ready"
    warnings: list[str] = []
    if any(holding.value is None or holding.as_of is None for holding in rows):
        status = "partial"
        warnings.append("Some holdings are missing a value or as-of timestamp.")
    if any(holding.last_price is None for holding in rows):
        warnings.append("Some prices are unavailable.")

    return PortfolioSummary(
        total_value=total_value if total_value else None,
        day_change=None,
        invested=invested if invested else None,
        pnl=pnl if pnl else None,
        currency="INR",
        as_of=as_of,
        status=status,
        sources=get_sources(),
        warnings=warnings,
    )


def calculate_allocations() -> list[AllocationBucket]:
    holdings = get_holdings()
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
                    currency,
                    source_name,
                    as_of
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    instrument_name = excluded.instrument_name,
                    asset_class = excluded.asset_class,
                    symbol = excluded.symbol,
                    quantity = excluded.quantity,
                    average_cost = excluded.average_cost,
                    last_price = excluded.last_price,
                    value = excluded.value,
                    pnl = excluded.pnl,
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


def clear_local_data() -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM holdings")
        connection.execute("DELETE FROM sips")
        connection.execute("DELETE FROM sources")
        connection.execute("DELETE FROM imports")
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
