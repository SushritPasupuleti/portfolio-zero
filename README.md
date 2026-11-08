# Portfolio Puffin

A local-first, read-only portfolio dashboard. Zerodha Kite Connect Personal provides account holdings, positions, mutual-fund holdings, and SIP schedules. Preferences are stored in SQLite. Optional Yahoo Finance daily closes can refresh Zerodha equity marks through `yfinance` after you enable the feature and confirm you have permission for that access.

## Current state

The repository has a React dashboard, FastAPI API, SQLite storage, read-only Kite portfolio sync and token setup, a separate editable manual-position ledger, CSV import/export and bulk edits, portfolio summary/holdings/SIP/source/export endpoints, import preview/commit endpoints, and a legacy Streamlit token helper. Settings include manual-import visibility, Catppuccin theme, Zerodha refresh behavior, local Ollama endpoint/model, and optional Yahoo price/news refresh. The UI also includes a source split, glossary, source activity, local AI portfolio review, and a portfolio news digest that can be summarized by the configured local model. Curated market RSS and Yahoo portfolio headlines are cached in SQLite with source-level refresh timing. AI reports are saved locally, browsable, and exportable as Markdown. Portfolio reports include a clearly labeled equal-weight rebalancing scenario with calculated unit counts when prices are recent enough. NPS Tier-I valuation, monthly contribution details, and an annual-return assumption can also be stored locally and counted toward the portfolio total when enabled. Yahoo access remains manually triggered and gated by saved preferences; RSS is independently enabled in Settings.

See the [detailed project plan](docs/project-plan.md) for the revised roadmap, [market-data source assessment](docs/market-data-sources.md) for the Personal/Yahoo distinction and data terms, and [news and AI reports](docs/news-and-ai.md) for RSS sources, SQLite caching, and report behavior.

For the separate non-Zerodha portfolio grid and CSV format, see the [manual portfolio editor guide](docs/manual-portfolio-editor.md).

## Stack

- React + Vite + TypeScript dashboard
- FastAPI + SQLite, with Python dependencies managed by `uv`
- React Kite login, callback capture, and local token exchange
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

## Run on a k3s homelab

For a private homelab or lab cluster, build images, push them to your registry, and apply the Kubernetes manifests in `k8s/`:

```sh
make k3s-build
make k3s-push
make k3s-apply
```

Then point a DNS name such as `portfolio.home.arpa` or `portfolio.local` to the k3s ingress node and access the app there. The manifests use a persistent volume for the API data directory and route `/api/*` requests to the FastAPI service behind the UI.

See [docs/homelab-k3s.md](docs/homelab-k3s.md) for the full cluster setup, secret and registry flow, and local DNS notes.

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

Open <http://127.0.0.1:5173>, then go to **Settings → Zerodha connection**. Save your Kite API key and secret once; they are stored in the local secret store and prefilled on later visits. The login URL is generated and shown automatically. Set the Kite Developer Console redirect URL to the exact URL shown in Settings (normally `http://127.0.0.1:5173/`). After sign-in, the callback request token is exchanged automatically, and only the expiring access token needs renewal. Docker Compose mounts `backend/data` into the API container so it can read those secrets and persist portfolio snapshots.

Python dependencies live in `backend/pyproject.toml` and `backend/uv.lock`. Use `make -C backend lock` after changing them.

## Zerodha: choose Personal

Choose **Personal** in the Kite Developer Console for this single-user portfolio app. Personal provides access to account and portfolio APIs, including holdings/positions/funds, while excluding the separate live quote, WebSocket, and historical market-data products. Those are different capabilities; lack of live quotes does **not** mean the app cannot read your portfolio.

The React dashboard obtains a daily access token through its local backend and uses it for read-only portfolio sync. See the [Zerodha token setup guide](docs/zerodha-token-setup.md). No order placement or account mutation is implemented.

## Stock prices and NAV

Use Zerodha as the source of what you own. Valuation initially uses Kite's `last_price` and Coin NAV. An optional **Sync prices** action fetches raw daily closes for supported Zerodha equity tickers through yfinance, then labels the source and date. It is off by default; the UI requires a permission acknowledgment before any download, and automatic refresh also requires its own toggle. Yahoo is not an official API and its terms may restrict automated collection. Read [docs/market-data-sources.md](docs/market-data-sources.md) before enabling.

## Local model options

See [infra/llm-profiles.md](infra/llm-profiles.md) for Ollama setup. Gemma 4 presets are available in Settings; choose a model that fits your memory. AI review is off by default and sends the holdings snapshot and saved news context only to the configured local Ollama endpoint when requested. The response is rendered as Markdown in the dashboard. No brokerage data should be sent to a hosted LLM.

## Common commands

| Command | What it does |
| --- | --- |
| `make setup` | Sync Python dependencies and install frontend packages |
| `make api` | Run FastAPI locally with reload |
| `make web` | Run the Vite development server |
| `make token-ui` | Run the legacy loopback-only Streamlit token setup page |
| `make dev` | Build and start Docker Compose |
| `make dev-ai` | Start the app with the optional local Ollama service |
| `make docker-down` | Stop Docker Compose |
| `make -C backend lint` | Run Ruff against the API |
| `make -C backend lock` | Update Python dependency lockfile |

## Safety scope

The app is for private personal use and is intended to be read-only. No orders, position conversions, holding authorizations, or MF order/SIP mutations will be exposed. Market-data freshness and source must be visible. AI explanations are informational and may be wrong; they are not forecasts or personalized financial advice.
