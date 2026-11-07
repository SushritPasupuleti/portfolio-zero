# Portfolio Puffin

A local-first, read-only portfolio dashboard. Zerodha Kite Connect Personal provides account holdings, positions, mutual-fund holdings, and SIP schedules. The dashboard uses broker-reported prices returned with the portfolio snapshot; separate historical market data is not integrated.

## Current state

The repository has a React dashboard, FastAPI API, SQLite storage, read-only Kite portfolio sync, portfolio summary/holdings/SIP/source/export endpoints, import preview/commit endpoints, and a Streamlit token setup UI. When a token is configured, the dashboard syncs on launch and from **Sync Zerodha**. Syncs fetch holdings, net positions, Coin MF holdings, and SIP schedules, then replace the previous Zerodha snapshot while preserving the last good snapshot on errors. Broker-reported price values are labeled with their returned date where available.

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
- For native development: [`uv`](https://docs.astral.sh/uv/getting-started/installation/), Node.js 22/npm, and GNU Make. `frontend/.node-version` selects the matching Node version for fnm.
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

The Vite frontend requires Node.js 22 (the same major version used by the
container). With [fnm](https://github.com/Schniz/fnm), run these commands from
the repository root before `make setup`:

```sh
cd frontend
fnm install
fnm use
cd ..
make setup
```

Older Node versions can fail before Vite serves the page, which may look like a
blank app. If your shell has fnm's directory auto-switching enabled, entering
`frontend/` may select the pinned version automatically.

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

Then open <http://127.0.0.1:8501>. Keep it on loopback. The token UI stores the API key and access token in the local secret store. Docker Compose mounts `backend/data` into the API container so the backend can read those local secrets and persist the portfolio snapshot.

Python dependencies live in `backend/pyproject.toml` and `backend/uv.lock`. Use `make -C backend lock` after changing them.

## Zerodha: choose Personal

Choose **Personal** in the Kite Developer Console for this single-user portfolio app. Personal provides access to account and portfolio APIs, including holdings/positions/funds, while excluding the separate live quote, WebSocket, and historical market-data products. Those are different capabilities; lack of live quotes does **not** mean the app cannot read your portfolio.

The token UI obtains a daily access token. The React dashboard uses it through the backend for read-only portfolio sync. See the [Zerodha token setup guide](docs/zerodha-token-setup.md). No order placement or account mutation is implemented.

## Stock prices and NAV

Use Zerodha as the source of what you own. Current portfolio valuation uses the `last_price` returned with Kite holdings/positions and the latest NAV returned with Coin MF holdings; the UI labels the value date when supplied. Separate Yahoo Finance history through `yfinance` remains deferred: it is a free, no-key Python client but not an official Yahoo API, and automated collection needs permission under Yahoo's terms. Read [docs/market-data-sources.md](docs/market-data-sources.md) for the permission gate and fallback options. Prices in the current snapshot are broker-reported marks, not a dedicated live quote feed.

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
