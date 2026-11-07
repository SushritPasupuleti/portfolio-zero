# Portfolio Puffin

A local-first, read-only portfolio dashboard. Zerodha Kite Connect Personal provides account holdings, positions, mutual-fund holdings, and SIP schedules. Preferences are stored in SQLite. Optional Yahoo Finance daily closes can refresh Zerodha equity marks through `yfinance` after you enable the feature and confirm you have permission for that access.

## Current state

The repository has a React dashboard, FastAPI API, SQLite storage, read-only Kite portfolio sync, portfolio summary/holdings/SIP/source/export endpoints, import preview/commit endpoints, and a Streamlit token setup UI. Settings include manual-import visibility, Zerodha refresh behavior, local Ollama endpoint/model, and optional Yahoo daily-close refresh. The UI also includes a glossary, source activity, and local AI portfolio review. Syncs preserve the last good snapshot on errors and prices show their source/date.

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

Use Zerodha as the source of what you own. Valuation initially uses Kite's `last_price` and Coin NAV. An optional **Sync prices** action fetches raw daily closes for supported Zerodha equity tickers through yfinance, then labels the source and date. It is off by default; the UI requires a permission acknowledgment before any download, and automatic refresh also requires its own toggle. Yahoo is not an official API and its terms may restrict automated collection. Read [docs/market-data-sources.md](docs/market-data-sources.md) before enabling.

## Local model options

See [infra/llm-profiles.md](infra/llm-profiles.md) for Ollama setup. Gemma 4 presets are available in Settings; choose a model that fits your memory. AI review is off by default and sends the holdings snapshot only to the configured local Ollama endpoint. No brokerage data should be sent to a hosted LLM.

## Common commands

| Command | What it does |
| --- | --- |
| `make setup` | Sync Python dependencies and install frontend packages |
| `make api` | Run FastAPI locally with reload |
| `make web` | Run the Vite development server |
| `make token-ui` | Run the loopback-only Zerodha token setup page |
| `make dev` | Build and start Docker Compose |
| `make dev-ai` | Start the app with the optional local Ollama service |
| `make docker-down` | Stop Docker Compose |
| `make -C backend lint` | Run Ruff against the API |
| `make -C backend lock` | Update Python dependency lockfile |

## Safety scope

The app is for private personal use and is intended to be read-only. No orders, position conversions, holding authorizations, or MF order/SIP mutations will be exposed. Market-data freshness and source must be visible. AI explanations are informational and may be wrong; they are not forecasts or personalized financial advice.
