.PHONY: setup dev dev-ai api web token-ui docker-up docker-down frontend-install python-sync k3s-build k3s-push k3s-apply k3s-status k3s-delete

APP_NAME ?= portfolio-puffin
IMAGE_TAG ?= latest
API_IMAGE ?= $(APP_NAME)-api:$(IMAGE_TAG)
WEB_IMAGE ?= $(APP_NAME)-web:$(IMAGE_TAG)
K8S_NAMESPACE ?= portfolio-puffin
KUBECTL ?= kubectl

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

k3s-build:
	docker build -t $(API_IMAGE) ./backend
	docker build -t $(WEB_IMAGE) ./frontend

k3s-push:
	docker push $(API_IMAGE)
	docker push $(WEB_IMAGE)

k3s-apply:
	$(KUBECTL) apply -f k8s/

k3s-delete:
	$(KUBECTL) delete -f k8s/ --ignore-not-found=true

k3s-status:
	$(KUBECTL) -n $(K8S_NAMESPACE) get pods,svc,ingress,pvc
