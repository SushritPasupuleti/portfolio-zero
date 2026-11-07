from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite

from .kite_adapter import SOURCE_NAME
from .storage import get_holdings, update_market_prices, upsert_source_status

SOURCE_LABEL = "Yahoo Finance via yfinance"
SOURCE_TYPE = "yfinance_daily"


def sync_daily_prices() -> dict[str, int | str | list[str]]:
    """Refresh raw daily closes for supported Zerodha equity holdings."""
    import yfinance as yf

    candidates = [
        holding
        for holding in get_holdings(include_manual=False)
        if holding.source == SOURCE_NAME and holding.asset_class == "equity" and holding.symbol
    ]
    ticker_to_ids: dict[str, list[str]] = {}
    for holding in candidates:
        suffix = _exchange_suffix(holding.id)
        if not suffix:
            continue
        ticker_to_ids.setdefault(f"{holding.symbol}{suffix}", []).append(holding.id)

    if not ticker_to_ids:
        message = "No supported Zerodha equity symbols are available for daily price sync."
        upsert_source_status(
            SOURCE_LABEL,
            SOURCE_TYPE,
            "partial",
            status_message=message,
            last_error=message,
        )
        return {"updated": 0, "requested": 0, "missing": [], "message": message}

    tickers = list(ticker_to_ids)
    try:
        prices = yf.download(
            tickers=tickers,
            period="5d",
            interval="1d",
            auto_adjust=False,
            actions=False,
            progress=False,
            threads=False,
            timeout=20,
            group_by="ticker",
            multi_level_index=True,
        )
    except Exception as exc:
        message = "Yahoo Finance price download failed; existing prices were kept."
        upsert_source_status(
            SOURCE_LABEL,
            SOURCE_TYPE,
            "stale",
            status_message=message,
            last_error=type(exc).__name__,
        )
        raise RuntimeError(message) from exc

    updates: dict[str, dict[str, object]] = {}
    missing: list[str] = []
    for ticker in tickers:
        close_series = _close_series(prices, ticker, len(tickers) == 1)
        if close_series is None:
            missing.append(ticker)
            continue
        close_series = close_series.dropna()
        if close_series.empty:
            missing.append(ticker)
            continue
        close_value = float(close_series.iloc[-1])
        if not isfinite(close_value) or close_value <= 0:
            missing.append(ticker)
            continue
        price_date = close_series.index[-1].date().isoformat()
        for holding_id in ticker_to_ids[ticker]:
            updates[holding_id] = {"close": close_value, "price_as_of": price_date}

    updated = update_market_prices(updates, SOURCE_LABEL)
    state = "connected" if updated and not missing else "partial"
    message = (
        f"Updated {updated} equity prices from Yahoo Finance daily closes."
        if updated
        else "Yahoo Finance returned no usable daily closes; existing prices were kept."
    )
    if missing:
        message += f" {len(missing)} symbols were unavailable."
    upsert_source_status(
        SOURCE_LABEL,
        SOURCE_TYPE,
        state,
        as_of=datetime.now(UTC),
        status_message=message,
        last_error=(f"Unavailable symbols: {', '.join(missing[:20])}" if missing else None),
    )
    return {
        "updated": updated,
        "requested": len(tickers),
        "missing": missing,
        "message": message,
        "synced_at": datetime.now(UTC).isoformat(),
    }


def _exchange_suffix(holding_id: str) -> str | None:
    parts = holding_id.split(":")
    if len(parts) >= 3 and parts[0] == "kite-equity":
        exchange = parts[1].upper()
        if exchange == "NSE":
            return ".NS"
        if exchange == "BSE":
            return ".BO"
    return None


def _close_series(data: object, ticker: str, single_ticker: bool):
    if data is None or getattr(data, "empty", True):
        return None
    columns = data.columns
    if getattr(columns, "nlevels", 1) > 1:
        first_level = columns.get_level_values(0)
        second_level = columns.get_level_values(1)
        if ticker in first_level:
            frame = data[ticker]
        elif ticker in second_level:
            frame = data.xs(ticker, axis=1, level=1)
        else:
            return None
        return frame.get("Close")
    if single_ticker and "Close" in columns:
        return data["Close"]
    return None
