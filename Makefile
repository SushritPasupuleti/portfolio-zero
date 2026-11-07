.PHONY: setup dev dev-ai api web token-ui docker-up docker-down frontend-install python-sync

setup: python-sync frontend-install

python-sync:
	cd backend && uv sync

frontend-install:
	cd frontend && npm install

# Run `make api` and `make web` in separate terminals for local development.
api:
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

web:
	cd frontend && npm run dev -- --host 127.0.0.1

token-ui:
	cd backend && uv run streamlit run app/token_ui.py --server.address 127.0.0.1 --server.port 8501

dev docker-up:
	docker compose up --build

dev-ai:
	docker compose --profile ai up --build

docker-down:
	docker compose down
