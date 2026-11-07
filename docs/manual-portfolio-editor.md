# Manual portfolio editor

The **Manual portfolio** view stores positions separately from the Zerodha
snapshot. Use it for accounts held with another broker/app or assets that Kite
does not return. Rows are persisted in the local SQLite `manual_positions`
table and never overwritten by a Zerodha sync.

## Editor fields

| Field | Meaning |
| --- | --- |
| Ticker | Exchange ticker or fund identifier |
| Units | Shares or units held; must be positive |
| Market | `NSE`, `BSE`, or `NYSE`; used to map Yahoo Finance tickers |
| Buy price | Recorded acquisition price per unit in the selected market currency |
| Current price | Filled by an eligible Yahoo Finance daily-close sync |
| Source | The broker/app where the position is held (for example, Groww or IBKR) |
| Type | Stock, mutual fund, ETF, bond, or other |

Use **Save edits** after changing cells. Select several rows to change their
market, source, or type together, or to delete them together. CSV import can
append rows or replace the manual ledger. Replace mode requires every CSV row
to validate before it changes saved data.

## CSV format

The CSV header is:

```csv
ticker,units,market,buy_price,current_price,source,asset_type
RELIANCE,10,NSE,2500,,Groww,stock
MSFT,2,NYSE,410,,IBKR,stock
```

`ticker`, `units`, `market`, `buy_price`, `source`, and `asset_type` are
required. `current_price` is optional and is normally populated by the gated
Yahoo sync. Export the current ledger from the editor to get a ready-to-edit
CSV with the same column names.

## Analysis and currencies

Manual holdings join portfolio totals, allocation, and local AI review when
the **Show manual imports** preference is enabled. Foreign-currency positions
remain visible in holdings and in the homepage source split. USD values are
excluded from INR totals and allocation until currency conversion is added;
the app does not combine unlike currencies.

Yahoo prices are daily closes, not live quotes. Yahoo refresh is disabled until
enabled in Settings and the user confirms the relevant access is permitted.
