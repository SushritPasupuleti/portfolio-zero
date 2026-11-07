# Portfolio Puffin — Project Plan

**Status:** Active implementation plan; the repository is an early scaffold.  
**Planning baseline:** 7 November 2026  
**Product shape:** A private, local-first portfolio dashboard. Zerodha Kite Personal is the account-data source; separate EOD/NAV sources provide prices where the Personal API does not.

## 1. Product goal

Build a locally hosted, read-only dashboard that imports the user's Zerodha portfolio directly through Kite Connect **Personal**. It should show equity holdings, positions, Coin mutual-fund holdings and SIPs; explain how each total was produced; and show the freshness and origin of both account data and prices.

Zerodha Personal is not a dead end for this use case. It is the recommended starting app type because it is intended to provide personal account/portfolio APIs without the paid Kite market-data products. It does not include dedicated live quotes, WebSockets, or historical chart data. The application will therefore separate *what the user owns* (Zerodha) from *market prices/history* (a separate EOD/NAV provider). It will not claim to provide live portfolio valuation.

Optional local Gemma analysis may summarize allocation, concentration, and changes. Portfolio data and inference stay on the user's machine. The model cannot trade or send orders.

## 2. Product principles and constraints

- **Personal first:** Create a Kite Connect Personal app for this single-user, private dashboard. Do not require a paid market-data app to retrieve account holdings.
- **Zerodha is the position source of truth:** Only Zerodha account APIs (or a user-selected statement import fallback) establish quantities, units, positions, average costs, and SIP state. An external quote provider never creates or removes portfolio rows.
- **Separate client code from data rights:** `yfinance` is open-source software, but Yahoo Finance is a separate service and its data is not made FOSS by the client license. Confirm permission for automated use before enabling scheduled downloads.
- **No live-price claim:** Personal excludes live and historical market data products. Use broker-reported marks only when returned as part of an account report, label their timestamp, and otherwise use clearly labeled daily closes/NAVs.
- **No invented numbers:** Missing, stale, partial, or mismatched values appear as unavailable or needing review, never silently as zero.
- **Traceable figures:** Each number carries its source, as-of time/date, currency, and price type. Cost-basis and return assumptions are visible.
- **Read-only by construction:** Do not implement any order, SIP mutation, authorization, or other account-write UI/API call. Do not call SDK write methods.
- **Local by default:** Web and API ports bind to loopback. Broker data goes only to Zerodha; EOD/NAV requests go only to configured sources; model requests go only to a local inference server.
- **Accessible by design:** Keyboard access, visible focus, semantic structure, non-color status cues, responsive layout, and assistive-technology labels are release requirements.
- **Useful without AI:** Gemma is optional. The dashboard and account connection must work when no local model is installed or running.

## 3. Scope

### First useful release

- Connect to one Zerodha account through a Kite Personal app and fetch equity holdings, positions, Coin MF holdings, and SIP schedules via read methods.
- Keep the access-token lifecycle explicit: one login/session per trading day as required; show when reauthentication is needed.
- Save timestamped raw API snapshots locally for audit/reconciliation, plus a normalized model used by the dashboard. Treat raw snapshots as sensitive account data.
- Use Yahoo Finance through `yfinance` for daily stock history without a user API key, subject to confirming that automated personal use is permitted. Show “daily close” and the actual data date.
- Use Zerodha's returned mutual-fund NAV and NAV date where available; optionally use AMFI's daily NAV report as a fallback, with ISIN-based matching and explicit provenance.
- Show portfolio value, invested amount and P&L only when the underlying source fields support the calculation. Show asset allocation and concentration.
- Provide a manual CSV/statement import fallback for account data that the API does not provide, has temporarily failed to return, or needs for historical backfill.
- Offer manual refresh, freshness/source status, import/reconciliation status, CSV export, encrypted local backup/restore, and delete/disconnect flows.
- Provide optional local Gemma explanation through MLX on Apple silicon or a low-memory Ollama profile (Gemma 3 1B as the 8 GB starting point).

### Later scope

- Portfolio time-weighted or money-weighted returns after transaction history is available and reconciled.
- More market-data providers, live quotes through a separately licensed plan, or a self-hosted EOD ingestion pipeline.
- More assets (cash, EPF, NPS, crypto) only if the user chooses them.
- Multi-user/public hosting only after a new product, data-rights, and security review.

### Out of scope

- Placing, modifying, cancelling, or recommending execution of trades or SIP changes.
- Treating Yahoo Finance or any other daily-price source as live data.
- Sending brokerage data to hosted LLMs, telemetry services, or an external analytics service.
- Scraping Kite/Coin/NSE/BSE web pages or handling a Zerodha password/TOTP.
- Guaranteed forecasts or personalized regulated financial advice.
- Redistributing raw exchange/provider data or presenting a private-use data license as a commercial license.

## 4. Current repository baseline

| Area | Present now | Still required |
| --- | --- | --- |
| Frontend | React/Vite dashboard shell, API-backed summary/holdings/SIP/source status, automatic and manual Zerodha sync, price-date labels | Import flow, price provenance refinements, charts with text summaries |
| API | FastAPI health/token status, read-only Kite portfolio adapter, SQLite-backed summary/holdings/SIPs/sources/export, import preview/commit endpoints | Additional provider adapters, schema/migration hardening, market-data source routes |
| Python | `uv`, `pyproject.toml`, `uv.lock`, Docker build, Make targets | Provider adapters, migrations, and application hardening |
| Runtime | Docker Compose, loopback-bound ports, Vite API proxy, local Streamlit token UI | Health checks, persistent encrypted store, backup/restore, robust lifecycle/recovery |
| Zerodha | `kiteconnect` dependency; local Streamlit token exchange/save UI; token status check; read-only Personal holdings/positions/MF/SIP sync | Verify live endpoint permissions and add richer partial-source recovery |
| Prices | Provider research in [market-data-sources.md](market-data-sources.md) | EOD/NAV adapters, symbol mapping, local cache, stale/missing price UI |
| AI | Local model profiles for MLX and Ollama documented | Model health, grounded insight service, privacy boundary and failure states |
| Quality | API test cases exist for health, token status/save, imports, and summary | Run/expand checks for real adapters, storage security, calculations, and manual accessibility review |

The dashboard now syncs read-only Kite holdings, net positions, mutual-fund holdings, and SIP schedules through the backend and stores the latest successful snapshot locally. The token setup helper stores credentials through the local secret-store layer. The app uses broker-reported prices in account responses; a separate EOD price provider remains deferred pending the Yahoo terms/permission review. Imported normalized rows can be stored through the API, but there is no CSV parser/file-import UI yet.

## 5. Source and pricing decisions

### Account data: Zerodha Personal

Use the user's Zerodha Developer Console to create a **Personal** type app. The screenshot's Personal option is appropriate: Zerodha describes Personal APIs as providing personal account features including holdings, positions, and funds, without the live/historical market-data products ([Personal announcement](https://kite.trade/forum/discussion/14868/introducing-kite-connect-personal-apis-free-apis-for-personal-use)). The official [portfolio API](https://www.kite.trade/docs/connect/v3/portfolio/) and [mutual-funds API](https://kite.trade/docs/connect/v3/mutual-funds/) documentation lists read endpoints for equity holdings/positions, MF holdings, and SIPs. Personal can also include order-write capabilities, so the application must intentionally leave those methods unused.

The portfolio response schema documents fields such as quantity, average price, last price, and P&L. Because Personal excludes market-data feeds, treat any `last_price` returned inside a portfolio response as a broker-reported account mark with its own freshness, not as proof that quote APIs are enabled or as a continuous quote source. Validate actual Personal app permissions during Phase 1.

### Stock prices: Yahoo Finance via `yfinance`, subject to terms approval

The requested candidate is Yahoo Finance through the `yfinance` Python client. It is free to install and common price-history calls do not require a Yahoo API key. The client is Apache-2.0 and unaffiliated with Yahoo; it uses Yahoo's undocumented public-facing endpoints. Yahoo's current Terms of Service prohibit automated collection without express prior permission. This is therefore an implementation gate: confirm that the user's intended personal local dashboard access is authorized or obtain permission before enabling automatic refresh. Do not represent this as an official Yahoo API or a fully FOSS data source.

If permitted, use it only for daily historical bars/last available close, with caching and visible source/date. The endpoint may throttle, change, or stop working without notice. Keep the provider replaceable and never use this data for live pricing, trade execution, or alerts. See [market-data-sources.md](market-data-sources.md) for terms and the fallback policy.

### Mutual-fund prices: Zerodha NAV first, AMFI fallback

Use the `last_price` and `last_price_date` in Zerodha MF holdings if present. For missing or stale NAV data, an optional AMFI NAV report adapter can map by fund ISIN and clearly identify AMFI as the fallback source. NAV is daily, not live.

### Historical portfolio performance

Historical security prices do not reconstruct a user's past portfolio by themselves. Ownership, buys, sells, transfers, and corporate actions also change. Begin storing dated snapshots from the first successful sync. For periods before first sync, backfill only from complete statements/trade history and mark completeness/reconciliation. Do not infer a historical portfolio from today's holdings multiplied by old prices.

## 6. Proposed architecture

```text
React + Vite (127.0.0.1:5173)
        │ same-origin /api proxy
        ▼
FastAPI (127.0.0.1:8000)
   ├── Kite Personal read adapter ──► Zerodha API
   ├── EOD/NAV adapters ────────────► Yahoo Finance / optional AMFI fallback
   ├── domain calculations + reconciliation
   ├── local SQLite snapshots + normalized model
   └── local Gemma adapter ─────────► MLX or Ollama on host
```

### Frontend

- Keep React, TypeScript, Vite, Lucide, and the existing shadcn/Radix component pattern.
- Build reusable connection/source status, freshness badges, holdings and positions tables, allocation summary, data import preview, and stale/error states.
- Display the exact price date and type (broker-reported, EOD close, or NAV) at row and portfolio level. During market hours, an EOD price remains labeled as the last close.
- Provide a text summary for charts; do not rely on color to encode gain/loss, freshness, or connection state.
- Keep secrets and authenticated API calls out of browser code.

### Backend

- Separate provider adapters from domain models so Zerodha, Yahoo Finance, and optional AMFI can be replaced without changing UI semantics.
- Perform Kite login-token exchange on FastAPI. The API secret never enters React or client-side storage.
- Define an allowlist of read methods: profile/connection validation, equity holdings, positions, MF holdings, SIP state, and only explicitly selected read reports. Exclude all write endpoints/methods, including order and SIP mutations.
- Store raw source snapshots and normalized data locally with fetch/import timestamps, provider, status, parser/schema version, and errors. Redact account IDs where they are not needed. Protect database/backups as sensitive data.
- Store price observations separately from portfolio positions: symbol/ISIN mapping, raw close/NAV, date, provider, adjustment flag, currency, and validation result.
- Return explicit `as_of`, `source`, `price_type`, `status`, `warnings`, and missing-data metadata in API responses.

### Initial data entities

- **Account connection:** provider, status, last success, expiry/reauth state, and last safe error; secrets are held separately.
- **Source snapshot:** provider, fetched/imported time, status, raw payload location or encrypted payload, schema version, and reconciliation metadata.
- **Instrument:** ISIN where available, symbol, exchange, name, asset class, and mapping provenance.
- **Equity holding:** instrument, quantity fields, average price, broker-reported mark/P&L where returned, source snapshot, and as-of timestamp.
- **Position:** instrument, quantity, product, average price, realized/unrealized fields, and account snapshot; read-only display.
- **Fund holding:** fund ISIN, name, units, average cost, NAV, NAV date, folio only if needed, source, and snapshot.
- **SIP:** fund ISIN/name, status, amount, frequency, next installment and data source/time.
- **Price observation:** instrument, raw OHLCV close, provider, exchange session date, currency, adjusted/raw flag, retrieval time, and validation status.
- **Portfolio snapshot:** timestamped totals/allocation derived from positions and price observations, with calculation version and completeness status.
- **Transaction/import row:** optional later; source reference, effective date, quantity/cash flow, validation result, and reconciliation status.

## 7. Roadmap

Phases should proceed in order. Each phase ends with its acceptance criteria, an updated setup guide, and a concise implementation note. Do not present placeholder UI or sample data as the user's real portfolio.

### Phase 0 — Developer foundation (mostly complete)

- [x] Establish React + Vite and FastAPI in one local workspace.
- [x] Add Docker Compose with services bound to loopback.
- [x] Move Python dependency management to `uv`, `pyproject.toml`, and `uv.lock`.
- [x] Add root/backend Makefiles and native run instructions.
- [x] Add a local Streamlit token setup flow that obtains a request token, exchanges it with `kiteconnect`, and saves the API key/access token in SQLite.
- [x] Add token-required API/UI state, SQLite-backed basic portfolio tables/endpoints, import preview/commit endpoints, and API test cases.
- [x] Document local MLX/Ollama model profiles.
- [x] Correct the app guidance to use Kite Personal and separate account data from market data.
- [x] Establish an accessible responsive dashboard shell with explicit no-data states.
- [ ] Add Compose health checks, persistent local data directory wiring, and documented reset path.
- [ ] Harden local credential storage: prefer OS keychain; otherwise require a user-managed encryption key for the local encrypted secret file and retain restrictive file permissions.
- [ ] Confirm clean setup from a fresh checkout on macOS and an 8 GB laptop.

**Exit criteria:** Fresh setup launches web/API/token UI; health and token-configured status are clear; token material is protected at rest; local data is ignored; API and web stay on loopback.

### Phase 1 — Zerodha Personal authentication and first sync (highest priority)

- [x] Provide a loopback Streamlit setup page that builds the Kite login URL, accepts the returned short-lived request token, exchanges it with the official SDK, and saves the resulting token locally. It currently uses the Personal app instructions.
- [x] Keep the API key/access token out of the portfolio database and browser; store credentials through the local secret-store layer. Never expose the API secret/access token in React, browser storage, logs, URLs after exchange, or source control.
- [ ] Verify the user's Personal app can read profile/status, equity holdings, positions, Coin MF holdings, and SIPs. Record endpoint scopes separately from market data; do not expect quote, WebSocket, or historical-candle access.
- [ ] Check permitted GET order/trade report capabilities and history depth for reconciliation; do not depend on short API history for long-term portfolio performance.
- [x] Add a FastAPI Kite adapter for equity holdings, net positions, Coin MF holdings, and SIP reads; atomically replace the local broker snapshot only after all reads succeed.
- [x] Add connection/source state separate from "token configured", including connected, reauth required, stale, invalid, and not yet synced states.
- [x] Preserve the last successful cached snapshot when a later sync fails or the daily token expires.
- [x] Add automatic initial sync, manual refresh, and redacted error UX.
- [ ] Exclude all market quote/history endpoints and all mutating calls (orders, position conversion, holding authorization, MF order/SIP create/modify/cancel).

**Exit criteria:** A Personal app can sync holdings/positions/funds/SIPs through the backend; source time and sync status are recorded; cached data survives token expiry; only approved reads are used. Remaining: verify the user's live Personal endpoint permissions and improve partial-source recovery.

### Phase 2 — Yahoo daily-price adapter and valuation

- [ ] Implement a replaceable `MarketDataProvider` interface with Yahoo Finance through `yfinance` as the requested candidate.
- [ ] Confirm the current Yahoo terms and permission for automated personal use before enabling downloads. `yfinance`'s no-key convenience is not evidence of an official API or authorization; keep the terms-review date and decision in docs.
- [ ] Map Zerodha instruments to Yahoo symbols using exchange + symbol (often with exchange suffixes) and ISIN where available. Validate matches; ambiguous rows remain unpriced pending review.
- [ ] Batch and cache daily history for held instruments; avoid one request per field/row. Use raw daily close for current value and separately labeled adjusted history for charts.
- [ ] Handle throttling, network failures, missing tickers, data corrections, and upstream breaks without clearing account holdings. Offer manual price import or a properly licensed provider if Yahoo access is not permitted/available.
- [ ] Use broker-reported price/P&L only when returned in an account response and clearly label it with its source and time; do not call Personal's unavailable quote APIs.
- [ ] Read MF NAV and NAV date from Zerodha MF holdings; implement AMFI fallback only for missing/stale NAV with ISIN matching and source labels.
- [ ] Add freshness badges and stale/missing price states; retain last successful cache during provider outage.
- [ ] Define formulas and reconcile totals against sanitized fixtures.

**Exit criteria:** Automated Yahoo use has a documented permission/terms decision; each mark has a provider/date/type; daily close is never presented as live; missing symbol mappings are visible; ownership remains sourced from Zerodha; provider outage does not delete holdings.

### Phase 3 — Local persistence and reliable calculations

- [x] Add an initial SQLite schema for app settings, holdings, SIPs, imports, and source status; add summary, holdings, allocation, SIP, source, export, and delete endpoints.
- [x] Add initial Pydantic response/import models and API tests for empty state, token status/save, and normalized import/summary behavior.
- [ ] Define versioned Pydantic models and matching TypeScript models for account connections, raw snapshots, normalized holdings, prices, SIPs, totals, and status.
- [ ] Replace ad-hoc `CREATE TABLE IF NOT EXISTS` setup with versioned SQLite migrations and safe transaction boundaries.
- [ ] Add separate tables for raw API snapshots and market-price observations, with local data path/volume and retention rules.
- [ ] Harden import validation, numeric/date normalization, duplicate handling, and commit/rollback so invalid imports do not replace good data.
- [ ] Add snapshot history and backup/restore endpoints; protect backup artifacts.
- [ ] Define calculation semantics for quantity × price, total value, invested amount, unrealized P&L, asset-class allocation, and concentration.
- [ ] Mark partial coverage, cross-currency limitations, stale price dates, corporate-action mismatches, and missing cost basis explicitly.
- [x] Add a basic CSV export endpoint.
- [ ] Add encrypted backup/restore.

**Exit criteria:** Calculations reconcile to sanitized cases; snapshots survive restart; deletion/restore behavior is documented; missing data never turns into zero or falsely complete totals.

### Phase 4 — Portfolio dashboard and reconciliation UI

- [x] Read API summary/token status in the React UI and show a setup-required state when no token is configured.
- [ ] Replace token-configured as a proxy for connection with API-backed sync/source status; a saved token alone must not be presented as a live portfolio connection.
- [ ] Render summary values only when they trace to real Zerodha snapshots or a reviewed import; distinguish imported test/sample records from live broker data.
- [ ] Build distinct equities, mutual funds, positions, and SIP sections.
- [ ] Build allocation by asset class/instrument and configurable concentration cues.
- [ ] Show amount, quantity/units, cost, price/NAV, value, P&L, source, and date at the level supported by the data.
- [ ] Add refresh feedback, connection repair, last success vs last attempt, stale and partial warnings.
- [ ] Add accessible snapshot history; do not call it historical portfolio performance until transaction/ownership history is complete.

**Exit criteria:** Every number is explainable from stored source observations; labels distinguish EOD vs broker-reported/NAV prices; all states are keyboard and screen-reader usable.

### Phase 5 — Manual imports and historical backfill

- [ ] Select supported Zerodha holdings/ledger/tradebook and Coin statement exports using sanitized examples.
- [ ] Parse previews with schema detection, strict size/type limits, row validation, duplicates, and source-date checks.
- [ ] Preserve the last good snapshot unless the user reviews and commits a valid replacement/import.
- [ ] Reconcile imports against current Personal holdings; show unmatched, duplicated, missing, and conflicting rows without silently merging.
- [ ] Use complete transactions/cash flows and dated holdings to backfill historical performance. Keep incompleteness explicit.
- [ ] Add export and encrypted backup/restore flows plus data-deletion confirmation.

**Exit criteria:** A malformed or partial file cannot wipe account data; a successful import has a reviewable result and provenance; historical performance is labeled complete only when the needed transactions and ownership history reconcile.

### Phase 6 — Local Gemma insights

- [ ] Add local-model health/configuration checks and distinguish “model offline” from “portfolio data unavailable.”
- [ ] Support MLX on Apple silicon and Ollama Gemma 3 1B for an 8 GB starting profile; keep larger models optional with memory guidance.
- [ ] Implement a provider adapter with timeouts, request bounds, and explicit local-only host validation by default.
- [ ] Send only normalized fields relevant to the question; never send raw statements, API credentials, or unused profile/account fields.
- [ ] Offer read-only summaries: allocation, concentration, data freshness, and changes between persisted snapshots.
- [ ] Require structured results with facts vs interpretation, citations to holding/source dates, assumptions, and uncertainty.
- [ ] Treat symbol names/imported free text as data rather than instructions; provide no order or SIP mutation tools.
- [ ] Keep insights informational, non-prescriptive, and disabled when evidence/model is unavailable.

**Exit criteria:** Model requests stay on the configured local endpoint; claims map to source observations and dates; offline behavior is clear; no AI action can write to Zerodha.

### Phase 7 — Hardening and release

- [ ] Complete keyboard-only, screen-reader, zoom/reflow, reduced-motion, and contrast reviews for connect, sync, import, dashboard, backup, and deletion flows.
- [ ] Add tests for auth state/CSRF protections, provider adapters, schema parsing, calculations, stale status, encryption, and write-method absence.
- [ ] Add accessibility checks and a manual assistive-technology review checklist.
- [ ] Review logs, SQLite snapshots, secret store, backups, Docker volumes, frontend errors, and retention/deletion behavior for data leakage.
- [ ] Verify Personal permissions and Yahoo Finance automated-use permission/terms immediately before release.
- [ ] Document daily re-login, provider dates, formulas, stock-data licensing caveat, recovery, backup, restore, and deletion.
- [ ] Keep dependencies/containers locked and build from a clean checkout.

**Exit criteria:** Fresh install, daily connect/reconnect, sync, price outage, import/reconcile, backup/restore, model-offline, expiry and deletion flows are verified. No trading writes, exposed secrets, or unresolved critical accessibility issues remain.

## 8. Security and privacy requirements

- Bind published ports to `127.0.0.1`; network exposure requires a separate authenticated deployment design and threat review.
- Keep API key, API secret, access token, raw API snapshots, account exports, SQLite files, and backups out of Git. Recheck `git status` before commits.
- Exchange request tokens on FastAPI only. Keep API secret out of React, browser storage, public URLs, and logs.
- Redact secrets, profile identifiers, and sensitive payloads from logs and exception messages.
- Use the Kite adapter allowlist. Ban order placement/modification/cancel, position conversion, holding authorization, MF order/SIP create/modify/cancel methods and routes.
- Protect raw snapshots and token material with OS keychain/app encryption where practical; use restrictive local file permissions and encrypted backups.
- Provide disconnect/revoke and delete-all-local-data controls and explain their impact.
- Restrict outbound requests to Zerodha, the selected EOD/NAV provider, and the explicitly configured local model endpoint. No cloud model fallback.
- Respect market-data terms: private personal use only for the candidate EOD service, no raw data redistribution, and review exchange rights before any public or business use.

## 9. Key risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Personal is confused with “no portfolio API” | Use Personal for account data; separately integrate an EOD/NAV source and explicitly exclude unsupported live/history endpoints |
| Personal endpoint permissions vary | Verify each read endpoint with the actual Personal app in Phase 1; preserve CSV fallback and report unsupported scopes |
| Access token is daily/short-lived | Server-side login exchange, expiry/re-auth status, protected local token storage, no hard-coded token |
| Yahoo's unofficial endpoints change, throttle, or are unavailable | Cache, batch requests, display source/date, retain provider abstraction, and provide a manual or licensed-provider fallback |
| Yahoo terms restrict automated collection | Treat permission/terms review as a release gate; do not enable scheduled downloads until authorized |
| Open-source `yfinance` is mistaken for FOSS Yahoo data | Document Apache client vs Yahoo service/data distinction and avoid redistribution or claims of a FOSS data license |
| Stock prices do not reconstruct past portfolio | Store snapshots going forward; backfill only from complete statements/transactions and label reconciliation |
| Corporate actions or symbol changes mismatch holdings | Match ISIN first, keep raw vs adjusted series separate, surface unresolved rows |
| MF NAV is stale or absent | Use Zerodha NAV date, optional AMFI fallback by ISIN, and visible stale status |
| LLM hallucinates or overstates conclusions | Evidence-bound context, source dates, typed output, uncertainty, read-only tools and no action APIs |
| Sensitive data leaks in local artifacts | Minimize profile fields, encrypt/protect snapshots/backups, redact logs, provide deletion, keep artifacts ignored |

## 10. Release checklist

- [ ] Fresh `make setup` succeeds; native `make api` and `make web` commands are documented.
- [ ] `make dev` builds and starts Docker; exposed ports are loopback-only.
- [ ] Personal login and supported account read endpoints work; token expiry and reauth are handled.
- [ ] Account holdings/positions/funds/SIPs remain authoritative; price-source failure never removes them.
- [ ] Yahoo daily values are labeled with source/date and never presented as live; automated fetching is enabled only if permitted.
- [ ] Stock mapping, raw/adjusted data, and stale/missing data behavior are verified.
- [ ] No order, position-conversion, holding-authorization, or MF write method is reachable.
- [ ] Import and historical backfill behavior preserves prior good data and reports reconciliation state.
- [ ] AI requests stay local, cite evidence, and have no write tools.
- [ ] Keyboard, screen-reader, narrow viewport, zoom, reduced-motion, and contrast reviews are complete.
- [ ] Backup/restore, disconnect/revoke, and delete-all-local-data procedures are verified.
- [ ] Git contains no `.env`, token, real account response, statement, database, or backup artifact.
