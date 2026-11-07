.PHONY: sync run lint lock

sync:
	uv sync

run:
	uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

lint:
	uv run ruff check app

lock:
	uv lock
