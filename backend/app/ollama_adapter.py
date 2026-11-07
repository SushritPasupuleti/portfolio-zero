from __future__ import annotations

import ipaddress
import json
from urllib.parse import urlsplit

import httpx

from .models import Holding

ALLOWED_HOSTS = {"localhost", "127.0.0.1", "::1", "host.docker.internal", "ollama"}


class OllamaUnavailable(Exception):
    pass


def validate_ollama_endpoint(endpoint: str) -> str:
    endpoint = endpoint.strip().rstrip("/")
    parsed = urlsplit(endpoint)
    if (
        parsed.scheme != "http"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Use an Ollama base URL such as http://127.0.0.1:11434.")

    hostname = parsed.hostname.casefold()
    is_loopback = False
    try:
        is_loopback = ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        pass
    if not is_loopback and hostname not in ALLOWED_HOSTS:
        raise ValueError(
            "For privacy, Ollama endpoints must be local: localhost, "
            "host.docker.internal, or the Docker service name ollama."
        )
    if parsed.port is not None and not 1 <= parsed.port <= 65535:
        raise ValueError("The Ollama endpoint port must be between 1 and 65535.")
    return endpoint


def installed_models(endpoint: str) -> list[dict[str, str | None]]:
    base_url = validate_ollama_endpoint(endpoint)
    try:
        response = httpx.get(f"{base_url}/api/tags", timeout=5.0)
        response.raise_for_status()
    except (httpx.HTTPError, ValueError) as exc:
        raise OllamaUnavailable(
            "Ollama is unavailable at this endpoint. Start Ollama or choose another local endpoint."
        ) from exc
    models = response.json().get("models", [])
    return [
        {
            "name": str(model.get("name", "")),
            "size": _format_size(model.get("size")),
            "family": (model.get("details") or {}).get("family"),
        }
        for model in models
        if model.get("name")
    ]


def generate_portfolio_insights(
    endpoint: str,
    model: str,
    holdings: list[Holding],
) -> dict[str, object]:
    base_url = validate_ollama_endpoint(endpoint)
    try:
        installed = installed_models(base_url)
    except OllamaUnavailable:
        raise
    if model not in {item["name"] for item in installed}:
        raise OllamaUnavailable(
            f"The selected model is not installed. Pull it with `ollama pull {model}` first."
        )

    portfolio = [
        {
            "instrument": item.instrument_name,
            "symbol": item.symbol,
            "asset_class": item.asset_class,
            "quantity": item.quantity,
            "average_cost": item.average_cost,
            "last_price": item.last_price,
            "value": item.value,
            "pnl": item.pnl,
            "price_source": item.price_source,
            "price_as_of": item.price_as_of.isoformat() if item.price_as_of else None,
        }
        for item in holdings[:200]
    ]
    if not portfolio:
        raise ValueError("Sync or import holdings before generating portfolio insights.")

    system_prompt = (
        "You are a local portfolio explainer. Use only the provided portfolio snapshot. "
        "Do not predict returns or recommend specific securities, buys, sells, or trades. "
        "Identify concentration, missing/stale prices, exposure mix, and data limitations. "
        "Every observation must cite values or instruments in the supplied data. "
        "Return JSON with keys summary (string) and insights (array of objects with "
        "title, detail, evidence, and type). Keep it concise and state that the snapshot "
        "is not a forecast."
    )
    user_prompt = json.dumps({"holdings": portfolio}, ensure_ascii=False)
    try:
        response = httpx.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "format": "json",
                "stream": False,
                "keep_alive": "5m",
                "options": {"temperature": 0.2},
            },
            timeout=120.0,
        )
        response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise OllamaUnavailable("The local model took too long to respond.") from exc
    except httpx.HTTPError as exc:
        raise OllamaUnavailable(
            "Ollama could not generate insights. Confirm the selected model is available."
        ) from exc

    content = response.json().get("message", {}).get("content", "")
    try:
        result = json.loads(content)
    except (TypeError, ValueError) as exc:
        raise OllamaUnavailable("The model returned an unreadable insight response.") from exc
    insights = result.get("insights", [])
    return {
        "summary": str(result.get("summary", "Portfolio review generated locally.")),
        "insights": [
            {
                "title": str(item.get("title", "Observation")),
                "detail": str(item.get("detail", "")),
                "evidence": str(item.get("evidence", "")),
                "type": str(item.get("type", "review")),
            }
            for item in insights[:8]
            if isinstance(item, dict)
        ],
        "model": model,
        "generated_at": response.json().get("created_at"),
        "scope": "Informational snapshot review; not a forecast or trade instruction.",
    }


def _format_size(value: object) -> str | None:
    if not isinstance(value, (int, float)):
        return None
    return f"{value / (1024**3):.1f} GB"
