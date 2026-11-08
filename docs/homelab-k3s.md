# Deploying Portfolio Puffin on k3s

This project ships with a minimal Kubernetes deployment for running the dashboard on a private homelab cluster. The layout keeps the API data directory on persistent storage and fronts the React app through NGINX so `/api/*` requests reach FastAPI without CORS issues.

## Prerequisites

- A working k3s cluster with `kubectl` configured.
- A container registry you can push to, for example GHCR, Docker Hub, or a self-hosted registry.
- A DNS name or `/etc/hosts` mapping for the app, such as `portfolio.home.arpa`.
- Optional: an Ollama service reachable from the cluster if you want local AI reviews.

## Build and publish the images

Set the image names to your registry and tag, then build and push the app images:

```sh
export REGISTRY=ghcr.io/your-user
export TAG=latest

docker build -t ${REGISTRY}/portfolio-puffin-api:${TAG} ./backend
docker build -t ${REGISTRY}/portfolio-puffin-web:${TAG} ./frontend
docker push ${REGISTRY}/portfolio-puffin-api:${TAG}
docker push ${REGISTRY}/portfolio-puffin-web:${TAG}
```

If you want to use the repository helpers instead, run:

```sh
make k3s-build
make k3s-push
```

Update the image names in `k8s/` before deployment if your registry differs from the defaults in the manifest.

## Apply the Kubernetes manifests

```sh
kubectl apply -f k8s/
```

The deployment creates:

- namespace `portfolio-puffin`
- config map with environment defaults for the API
- persistent volume claim for `backend/data`
- backend deployment and ClusterIP service
- frontend deployment and ClusterIP service
- ingress route for `portfolio.local` or `portfolio.home.arpa`

## Common cluster commands

```sh
kubectl -n portfolio-puffin get pods
kubectl -n portfolio-puffin get svc
kubectl -n portfolio-puffin get ingress
kubectl -n portfolio-puffin logs deploy/portfolio-puffin-api
kubectl -n portfolio-puffin logs deploy/portfolio-puffin-web
```

## DNS and ingress

The default manifest expects a host named `portfolio.home.arpa`.

Add a host entry on a machine that resolves the service:

```sh
sudo sh -c 'echo "127.0.0.1 portfolio.home.arpa" >> /etc/hosts'
```

For a real homelab, point the host to the ingress controller's node IP or use a local DNS record.

## Config and persistence

The API persists the local SQLite data and secret files under `/app/data` in a Kubernetes PVC. This is the same data directory used by the Docker Compose setup, so the app behaves like a local instance while continuing to run inside the cluster.

Update the ConfigMap in `k8s/configmap.yaml` if you need a different model endpoint.

```yaml
LLM_BASE_URL: "http://ollama.portfolio-puffin.svc.cluster.local:11434"
LLM_MODEL: "gemma4:e2b"
```

If you run Ollama outside the cluster, replace the value with the appropriate service or host address that the application can reach from the pod network.

## Secret handling

The provided secret template is intentionally a placeholder. Replace the values in `k8s/secret.yaml` with your own app-specific settings before applying it to a real cluster.

```sh
kubectl -n portfolio-puffin apply -f k8s/secret.yaml
```

The API can safely keep Zerodha tokens and local settings in the mounted PVC, but the volume should still be treated as sensitive account data.

## Notes

- The frontend is built as a static site behind NGINX; it is not intended for live Vite development in k3s.
- Any network path under `/api` is proxied to the backend service automatically, so the browser can keep using the same relative API routes.
- If you only need a local lab deployment, `kubectl port-forward -n portfolio-puffin svc/portfolio-puffin-web 8080:80` is also adequate for quick testing.
