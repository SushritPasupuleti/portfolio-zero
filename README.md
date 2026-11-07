# Portfolio Puffin

A local-first, read-only portfolio dashboard. Zerodha Kite Connect Personal is the planned source for the user's account data; a separate end-of-day market-data source fills the price-data gap in Personal.

## Current state

The repository has a React dashboard, FastAPI API, SQLite storage, portfolio summary/holdings/SIP/source/export endpoints, import preview/commit endpoints, and a Streamlit token setup UI. The token UI can exchange and save a Kite access token locally. **The API does not yet use that token to fetch real holdings, positions, mutual-fund holdings, or SIPs from Zerodha.** Imported records are not the same as a live broker connection. The dashboard must not be treated as showing a connected Zerodha portfolio until the connector phase is complete.

See the [detailed project plan](docs/project-plan.md) for the revised roadmap and [market-data source assessment](docs/market-data-sources.md) for the Personal/Yahoo distinction and data terms.

## Stack

- React + Vite + TypeScript dashboard
- FastAPI + SQLite, with Python dependencies managed by `uv`
- Streamlit local-only token setup helper
- shadcn/ui component patterns using Radix Slot, CVA, and shared class utilities
- Docker Compose, with published web/API ports bound to loopback
- Local AI target: MLX on Apple silicon or Ollama on an 8 GB laptop

## Prerequisites

- Docker Desktop for the containerized setup
- For native development: [`uv`](https://docs.astral.sh/uv/getting-started/installation/), Node.js/npm, and GNU Make
- A local model is optional; see [infra/llm-profiles.md](infra/llm-profiles.md)

## Run with Docker

```sh
test -f .env || cp .env.example .env
make dev
```

Open <http://localhost:5173>. FastAPI is available at <http://localhost:8000>. Stop the stack with `Ctrl+C` or `make docker-down`.

## Run natively

Install the Python and frontend dependencies once:

```sh
make setup
```

Start the API and web app in separate terminals from the repository root:

```sh
make api
```

```sh
make web
```

Open <http://127.0.0.1:5173>. For the local Zerodha token setup page, run this in a third terminal:

```sh
make token-ui
```

Then open <http://127.0.0.1:8501>. Keep it on loopback. The token UI currently stores the access token and API key in the local SQLite settings table; the project plan includes moving token storage to an OS keychain or an encrypted local store before direct broker sync ships.

Python dependencies live in `backend/pyproject.toml` and `backend/uv.lock`. Use `make -C backend lock` after changing them.

## Zerodha: choose Personal

Choose **Personal** in the Kite Developer Console for this single-user portfolio app. Personal provides access to account and portfolio APIs, including holdings/positions/funds, while excluding the separate live quote, WebSocket, and historical market-data products. Those are different capabilities; lack of live quotes does **not** mean the app cannot read your portfolio.

The token UI is not yet a portfolio connector. It obtains a daily access token, but actual API reads are the next implementation phase. See the [Zerodha token setup guide](docs/zerodha-token-setup.md). No order placement or account mutation will be implemented.

## Stock prices and NAV

Use Zerodha as the source of what you own. The requested stock-price candidate is Yahoo Finance through `yfinance`, a free, no-key Python client for daily price history. `yfinance` is open-source, but it is not an official Yahoo API and does not license Yahoo's data. Yahoo's current terms prohibit automated data collection without prior permission, so confirm this use is permitted before enabling automatic downloads. Prices are daily, not live. Read [docs/market-data-sources.md](docs/market-data-sources.md) for the permission gate and fallbacks. For mutual funds, use NAV values returned with Zerodha's MF holdings; AMFI is a possible daily NAV fallback.

## Local model options

See [infra/llm-profiles.md](infra/llm-profiles.md) for MLX and Ollama setup. The model is optional and must remain local; no brokerage data should be sent to a hosted LLM.

## Common commands

| Command | What it does |
| --- | --- |
| `make setup` | Sync Python dependencies and install frontend packages |
| `make api` | Run FastAPI locally with reload |
| `make web` | Run the Vite development server |
| `make token-ui` | Run the loopback-only Zerodha token setup page |
| `make dev` | Build and start Docker Compose |
| `make docker-down` | Stop Docker Compose |
| `make -C backend lint` | Run Ruff against the API |
| `make -C backend lock` | Update Python dependency lockfile |

## Safety scope

The app is for private personal use and is intended to be read-only. No orders, position conversions, holding authorizations, or MF order/SIP mutations will be exposed. Market-data freshness and source must be visible. AI explanations are informational and may be wrong; they are not forecasts or personalized financial advice.
