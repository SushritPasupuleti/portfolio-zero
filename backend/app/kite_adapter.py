from __future__ import annotations

from datetime import UTC, datetime

from kiteconnect import KiteConnect

from .storage import replace_source_snapshot, upsert_source_status

SOURCE_NAME = "Zerodha Kite"
SOURCE_TYPE = "zerodha_personal"


def sync_portfolio(api_key: str, access_token: str) -> dict[str, int | str]:
    """Fetch and persist only read-only portfolio data from Kite Connect."""
    kite = KiteConnect(api_key=api_key)
    kite.set_access_token(access_token)

    # Fetch the complete snapshot before replacing cached data. Any failed
    # endpoint leaves the previous successful local snapshot intact.
    equity_holdings = kite.holdings()
    position_response = kite.positions()
    mutual_fund_holdings = kite.mf_holdings()
    mutual_fund_sips = kite.mf_sips()

    if not isinstance(equity_holdings, list):
        raise ValueError("Unexpected holdings response")
    if not isinstance(position_response, dict) or not isinstance(
        position_response.get("net"), list
    ):
        raise ValueError("Unexpected positions response")
    if not isinstance(mutual_fund_holdings, list) or not isinstance(mutual_fund_sips, list):
        raise ValueError("Unexpected mutual fund response")

    as_of = datetime.now(UTC).isoformat()
    normalized_holdings: list[dict] = []

    for item in equity_holdings:
        exchange = item.get("exchange") or "NSE"
        symbol = item.get("tradingsymbol") or item.get("isin")
        quantity = float(item.get("quantity") or 0) + float(item.get("t1_quantity") or 0)
        if not symbol or quantity == 0:
            continue
        last_price = item.get("last_price")
        normalized_holdings.append(
            {
                "id": f"kite-equity:{exchange}:{symbol}",
                "instrument_name": symbol,
                "asset_class": "equity",
                "symbol": symbol,
                "quantity": quantity,
                "average_cost": item.get("average_price"),
                "last_price": last_price,
                "value": quantity * float(last_price) if last_price is not None else None,
                "pnl": item.get("pnl"),
                "price_as_of": as_of,
                "currency": "INR",
                "as_of": as_of,
            }
        )

    position_count = 0
    for item in position_response["net"]:
        symbol = item.get("tradingsymbol")
        quantity = float(item.get("quantity") or 0)
        if not symbol or quantity == 0:
            continue
        exchange = item.get("exchange") or "NSE"
        product = item.get("product") or ""
        last_price = item.get("last_price")
        asset_class = "equity_position" if exchange in {"NSE", "BSE"} else "derivative_position"
        normalized_holdings.append(
            {
                "id": f"kite-position:{exchange}:{product}:{symbol}",
                "instrument_name": symbol,
                "asset_class": asset_class,
                "symbol": symbol,
                "quantity": quantity,
                "average_cost": item.get("average_price"),
                "last_price": last_price,
                "value": (
                    quantity * float(last_price)
                    if last_price is not None
                    else item.get("value")
                ),
                "pnl": item.get("pnl"),
                "price_as_of": as_of,
                "currency": "INR",
                "as_of": as_of,
            }
        )
        position_count += 1

    for item in mutual_fund_holdings:
        isin = item.get("tradingsymbol")
        quantity = float(item.get("quantity") or 0)
        if not isin or quantity == 0:
            continue
        last_price = item.get("last_price")
        normalized_holdings.append(
            {
                "id": f"kite-mf:{isin}",
                "instrument_name": item.get("fund") or isin,
                "asset_class": "mutual_fund",
                "symbol": isin,
                "quantity": quantity,
                "average_cost": item.get("average_price"),
                "last_price": last_price,
                "value": quantity * float(last_price) if last_price is not None else None,
                "pnl": item.get("pnl"),
                "price_as_of": item.get("last_price_date"),
                "currency": "INR",
                "as_of": as_of,
            }
        )

    normalized_sips = [
        {
            "id": f"kite-sip:{item.get('sip_id') or item.get('tradingsymbol')}",
            "scheme_name": item.get("fund") or item.get("tradingsymbol") or "Mutual fund SIP",
            "amount": item.get("instalment_amount"),
            "frequency": item.get("frequency"),
            "next_date": item.get("next_instalment"),
            "status": item.get("status"),
            "as_of": as_of,
        }
        for item in mutual_fund_sips
        if item.get("sip_id") or item.get("tradingsymbol")
    ]

    equity_count = len(equity_holdings)
    mutual_fund_count = len(mutual_fund_holdings)
    holding_count, sip_count = replace_source_snapshot(
        normalized_holdings,
        normalized_sips,
        SOURCE_NAME,
    )
    upsert_source_status(
        SOURCE_NAME,
        SOURCE_TYPE,
        "connected",
        as_of=datetime.now(UTC),
        status_message=f"Synced {holding_count} holdings and {sip_count} SIPs from Zerodha.",
    )
    return {
        "holdings_synced": holding_count,
        "equity_holdings": equity_count,
        "positions": position_count,
        "mutual_fund_holdings": mutual_fund_count,
        "sips_synced": sip_count,
        "synced_at": datetime.now(UTC).isoformat(),
    }
