# Market data sources and pricing policy

## Recommendation

Use Zerodha Kite Connect **Personal** for the user's account data. For stock price history, the requested no-key source is Yahoo Finance through the open-source `yfinance` Python package. `yfinance` is free to install and does not require a Yahoo API key for common history downloads. It is not an official Yahoo API, however, and Yahoo's current terms prohibit automated collection without prior permission. Treat this as a personal-use candidate with a terms/permission gate, not a supported or guaranteed data service. Do not deploy automated Yahoo collection unless the user confirms the use is permitted or Yahoo grants permission.

The `yfinance` library is Apache-2.0, but that license covers the client code, not Yahoo's market data. Yahoo Finance is a data source/service, not a FOSS endpoint. The dependency can break or be throttled if Yahoo changes its undocumented endpoints; no service-level agreement or data accuracy guarantee is provided by the wrapper.

Use Zerodha's mutual-fund holdings and SIP reads for account-specific units, cost, and schedules. Use the NAV and NAV date returned with those account records when present. [AMFI's official NAV download](https://www.amfiindia.com/net-asset-value/nav-download) can be an optional fallback for missing NAV values; match by ISIN and preserve its date/source.

The current dashboard sync uses broker-reported `last_price` fields returned with Kite portfolio records for snapshot valuation. These are not fetched through the dedicated quote APIs and are not represented as a live stream. An optional yfinance adapter updates raw daily closes for mapped Zerodha NSE/BSE equity holdings and manually entered NSE/BSE/NYSE stock or ETF positions. It is disabled by default and requires both an enable toggle and the user's permission acknowledgment; automatic refresh also has a separate toggle. Mutual funds and derivatives are not priced by this adapter.

## Keep the sources distinct

| Need | Source of truth | Freshness/limits |
| --- | --- | --- |
| Equity holdings, quantities, average prices, account positions | Zerodha Kite Personal APIs | Refreshed after daily login; account API response timestamp is stored |
| Coin MF units, holdings, SIP schedule | Zerodha Kite Personal MF read APIs | Use returned NAV and `last_price_date` when provided; confirm endpoint availability on Personal during connector implementation |
| Equity prices included in current portfolio snapshot | Zerodha Kite holdings/positions response | Broker-reported `last_price`; display returned value date where available; not a dedicated quote feed |
| Equity daily prices/history | Yahoo Finance via `yfinance`, subject to its automated-access terms; optional manual/automatic sync is implemented behind a permission gate | No API key for common use; unofficial/undocumented endpoints; cache and label actual market date; never claim live data |
| MF NAV fallback | AMFI official NAV reports | Daily NAV publication; not intraday |
| Live quotes/intraday candles | Not in initial scope | Kite Personal excludes the live and historical market-data products; `yfinance` is not treated as a supported live feed |

Kite's portfolio holdings response schema includes account quantities, average price, last price, and P&L fields. However, the Personal plan excludes dedicated market-data services. Capture broker-reported marks only as part of the account response and show their source/date; do not build the Personal integration around the assumption that quote endpoints, WebSockets, or historical-candle APIs work. If the Personal response omits or denies a mark, use a permitted daily price source with an explicit source/date label.

## Yahoo Finance / yfinance assessment

- **No-key/free convenience:** `yfinance` can retrieve common price history without a user-supplied API key. It is a Python client, not an official Yahoo Finance API.
- **Code license:** The `yfinance` project is Apache-2.0. This does not license Yahoo's data.
- **Terms gate:** Yahoo's [Terms of Service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html?ncid=mbr_idnedulnk00000001) prohibit collecting data from its services through automated means without express prior permission; Yahoo's [India additional terms](https://legal.yahoo.com/in/en/yahoo/terms/additionalterms/index.html) also require compliance with the main Terms. The `yfinance` project says it is unaffiliated with Yahoo and directs users to Yahoo's data terms. Before enabling automatic fetches, confirm the user's personal dashboard use is authorized or obtain permission. If that cannot be established, use an authorized provider or user-supplied price CSV instead.
- **Reliability:** The wrapper relies on undocumented endpoints. Requests can be rate-limited, blocked, or broken by upstream changes without notice. There is no SLA.
- **Scope:** Plan for daily historical bars/last available close only. Do not use it for a live price display, order execution, or trading alerts.
- **Privacy:** Send only public ticker symbols and requested date ranges. Never send holding quantities, account IDs, cost basis, tokens, or statements.

Review the [`yfinance` README](https://github.com/ranaroussi/yfinance), its [download API reference](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html), and Yahoo's current terms before enabling use. The app records the permission acknowledgment in local preferences but cannot determine whether a particular use is authorized. This review was made on **7 November 2026**.

## Pricing rules

1. **Zerodha remains authoritative for what the user owns.** External prices never create or remove a portfolio row.
2. **Use raw daily close for current valuation**, keyed by exchange + symbol/ISIN where available. Use adjusted series only for charts/returns when explicitly labeled; do not multiply current units by adjusted historical prices.
3. **Value = quantity/units × selected price/NAV** for supported rows. Store the exact price, source, timestamp/date, currency, and whether it is broker-reported, EOD, or NAV.
4. **Never present a daily close as live.** Show per-row source/date and a portfolio-level latest-price date. During market hours, the Yahoo-derived mark remains the last available daily bar.
5. **Never blend fresh and stale values silently.** Retain cached data during provider outages and show delayed/missing-source state.
6. **Do not invent performance history.** Historical security prices alone are not a historical portfolio: ownership and cash flows change. Begin saving portfolio snapshots after first connection; backfill earlier performance only from complete transaction/statement history with reconciliation status.
7. **Missing mapping or corporate-action ambiguity means unpriced/needs review**, not a guessed symbol match. Prefer ISIN, then exchange + symbol with explicit mapping provenance.

## Fallback and provider independence

Keep a small `MarketDataProvider` interface so `yfinance` can be replaced or disabled. Cache successful daily data locally with provider/date metadata. If Yahoo access is not authorized, blocked, stale, or unavailable, continue showing account holdings without a current price, offer a user-supplied price/statement import, or configure a properly licensed provider. Do not scrape private Yahoo/NSE/BSE endpoints directly or add proxy evasion.

For accurate live prices, use a market-data service or broker/API plan that explicitly permits quote access. No-key does not mean official, licensed, unlimited, or reliable.
