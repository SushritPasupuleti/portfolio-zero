from __future__ import annotations

import hashlib
import re
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse
from xml.etree import ElementTree

import httpx

from .kite_adapter import SOURCE_NAME
from .storage import (
    get_holdings,
    get_news_articles,
    list_manual_positions,
    mark_news_source_fetched,
    news_source_is_fresh,
    prune_news_articles,
    upsert_news_articles,
    upsert_source_status,
)

NEWS_SOURCE = "Portfolio news"
NEWS_SOURCE_TYPE = "portfolio_news"
NEWS_CACHE_TTL_MINUTES = 30
MAX_NEWS_INSTRUMENTS = 40
MAX_FEED_ITEMS = 100

# Curated public RSS feeds inspired by Stock EZ's configurable news-source list.
# Yahoo ticker headlines are fetched separately through yfinance when enabled.
RSS_SOURCES: tuple[tuple[str, str], ...] = (
    (
        "Economic Times Markets",
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    ),
    (
        "Economic Times Stocks",
        "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
    ),
    ("Moneycontrol Market Reports", "https://www.moneycontrol.com/rss/marketreports.xml"),
    ("Business Standard Markets", "https://www.business-standard.com/rss/markets-106.rss"),
    ("Mint Markets", "https://www.livemint.com/rss/markets"),
)


def sync_portfolio_news(
    include_manual: bool,
    *,
    include_yahoo: bool,
    include_rss: bool,
    lookback_hours: int,
    max_articles: int,
) -> dict[str, object]:
    """Refresh per-holding Yahoo headlines and relevant market RSS items into SQLite."""
    holdings = get_holdings(include_manual=include_manual)
    manual_positions = {
        f"manual-position:{row['id']}": row for row in list_manual_positions()
    }
    instruments = _portfolio_instruments(holdings, manual_positions)
    collected: dict[str, dict[str, object]] = {}
    errors: list[str] = []
    refreshed_sources: list[str] = []
    skipped_sources: list[str] = []

    if include_yahoo:
        source_key = "yahoo-finance-portfolio"
        if news_source_is_fresh(source_key, NEWS_CACHE_TTL_MINUTES):
            skipped_sources.append("Yahoo Finance portfolio headlines")
        elif instruments:
            yahoo_articles, yahoo_errors = _fetch_yahoo_articles(instruments)
            errors.extend(yahoo_errors)
            _merge_articles(collected, yahoo_articles)
            if not yahoo_errors:
                mark_news_source_fetched(source_key)
                refreshed_sources.append("Yahoo Finance portfolio headlines")
        else:
            message = "No supported stocks, ETFs, or mutual funds are available for Yahoo news."
            errors.append(message)

    if include_rss:
        for source_name, source_url in RSS_SOURCES:
            source_key = f"rss:{source_name.casefold()}"
            if news_source_is_fresh(source_key, NEWS_CACHE_TTL_MINUTES):
                skipped_sources.append(source_name)
                continue
            try:
                feed_articles = _fetch_rss_feed(source_name, source_url)
            except (httpx.HTTPError, ElementTree.ParseError, ValueError) as exc:
                errors.append(f"{source_name}: {type(exc).__name__}")
                continue
            relevant = []
            for item in feed_articles:
                tagged = _tag_rss_relevance(item, instruments)
                if tagged is not None:
                    relevant.append(tagged)
            _merge_articles(collected, relevant)
            mark_news_source_fetched(source_key)
            refreshed_sources.append(source_name)
            time.sleep(0.2)

    fetched_at = datetime.now(UTC).isoformat()
    saved = upsert_news_articles(list(collected.values())) if collected else 0
    prune_news_articles(retention_days=30)
    cached = len(get_news_articles(lookback_hours, max_articles))
    if not refreshed_sources and skipped_sources and not errors:
        message = "News sources are up to date; showing the SQLite cache."
    elif errors and not collected and not refreshed_sources:
        message = "News sources could not be refreshed; the previous SQLite cache was kept."
    else:
        message = f"Saved or updated {saved} portfolio news stories."
        if refreshed_sources:
            message += f" Refreshed {len(refreshed_sources)} source(s)."
        if skipped_sources:
            message += f" Used {len(skipped_sources)} recently refreshed source(s) from cache."
    state = "partial" if errors else "connected"
    if errors and not collected and not refreshed_sources:
        state = "stale"
    upsert_source_status(
        NEWS_SOURCE,
        NEWS_SOURCE_TYPE,
        state,
        as_of=datetime.now(UTC) if refreshed_sources else None,
        status_message=message,
        last_error="; ".join(errors[:10]) if errors else None,
    )
    return {
        "fetched": saved,
        "cached_articles": cached,
        "instruments": len(instruments),
        "errors": errors,
        "sources_refreshed": refreshed_sources,
        "sources_from_cache": skipped_sources,
        "message": message,
        "lookback_hours": lookback_hours,
        "max_articles": max_articles,
        "fetched_at": fetched_at,
    }


def _portfolio_instruments(
    holdings: list[Any], manual_positions: dict[str, dict[str, object]]
) -> list[dict[str, str]]:
    instruments: dict[str, dict[str, str]] = {}
    for holding in holdings:
        if not holding.symbol:
            continue
        manual = manual_positions.get(holding.id)
        if manual:
            asset_type = str(manual["asset_type"])
            if asset_type in {"stock", "etf"}:
                suffix = {"NSE": ".NS", "BSE": ".BO", "NYSE": ""}.get(
                    str(manual["market"])
                )
                if suffix is None:
                    continue
                ticker = _with_suffix(holding.symbol, suffix)
                kind = asset_type
            elif asset_type == "mf":
                ticker = str(holding.symbol)
                kind = "mutual_fund"
            else:
                continue
        elif holding.source == SOURCE_NAME and holding.asset_class == "equity":
            market = _market_from_kite_id(holding.id)
            suffix = {"NSE": ".NS", "BSE": ".BO"}.get(market or "")
            if suffix is None:
                continue
            ticker = _with_suffix(holding.symbol, suffix)
            kind = "stock"
        elif holding.source == SOURCE_NAME and holding.asset_class == "mutual_fund":
            ticker = str(holding.symbol)
            kind = "mutual_fund"
        else:
            continue
        instruments[ticker] = {
            "ticker": ticker,
            "instrument_name": str(holding.instrument_name),
            "asset_type": kind,
        }
    return list(instruments.values())[:MAX_NEWS_INSTRUMENTS]


def _with_suffix(symbol: str, suffix: str) -> str:
    normalized = symbol.strip().upper()
    for existing in (".NS", ".BO"):
        if normalized.endswith(existing):
            normalized = normalized[: -len(existing)]
    return f"{normalized}{suffix}"


def _fetch_yahoo_articles(
    instruments: list[dict[str, str]],
) -> tuple[list[dict[str, object]], list[str]]:
    import yfinance as yf

    fetched_at = datetime.now(UTC).isoformat()
    articles: list[dict[str, object]] = []
    errors: list[str] = []
    for instrument in instruments:
        ticker = instrument["ticker"]
        try:
            if instrument["asset_type"] == "mutual_fund":
                response = yf.Search(
                    instrument["instrument_name"],
                    max_results=1,
                    news_count=4,
                    include_cb=False,
                    timeout=15,
                    raise_errors=False,
                )
                raw_articles = response.news or []
            else:
                raw_articles = yf.Ticker(ticker).get_news(count=4, tab="news") or []
            for raw in raw_articles:
                article = _normalize_yahoo_article(raw, instrument, fetched_at)
                if article:
                    articles.append(article)
        except Exception as exc:
            errors.append(f"{ticker}: {type(exc).__name__}")
    return articles, errors


def _normalize_yahoo_article(
    raw: dict[str, Any], instrument: dict[str, str], fetched_at: str
) -> dict[str, object] | None:
    content = raw.get("content") if isinstance(raw.get("content"), dict) else raw
    title = content.get("title")
    if not isinstance(title, str) or not title.strip():
        return None
    canonical = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
    url = canonical.get("url") if isinstance(canonical, dict) else canonical
    url = _safe_url(url)
    provider = content.get("provider") or {}
    publisher = provider.get("displayName") if isinstance(provider, dict) else provider
    summary = _clean_text(content.get("summary") or content.get("description") or "")
    published_at = _published_at(content.get("pubDate") or content.get("published_at"))
    return _article_row(
        title=title,
        summary=summary,
        publisher=str(publisher) if publisher else "Yahoo Finance",
        url=url,
        published_at=published_at,
        fetched_at=fetched_at,
        source_key="yahoo-finance-portfolio",
        instruments=[instrument],
    )


def _fetch_rss_feed(source_name: str, source_url: str) -> list[dict[str, object]]:
    response = httpx.get(
        source_url,
        headers={"User-Agent": "PortfolioPuffin/1.0 (local portfolio news reader)"},
        timeout=12.0,
        follow_redirects=True,
    )
    response.raise_for_status()
    root = ElementTree.fromstring(response.content)
    fetched_at = datetime.now(UTC).isoformat()
    entries = [
        node for node in root.iter()
        if _local_name(node.tag) in {"item", "entry"}
    ][:MAX_FEED_ITEMS]
    articles = []
    for entry in entries:
        title = _child_text(entry, "title")
        if not title:
            continue
        link_node = next(
            (child for child in entry if _local_name(child.tag) == "link"), None
        )
        link = (link_node.attrib.get("href") if link_node is not None else None)
        link = link or (link_node.text if link_node is not None else None)
        url = _safe_url(link)
        summary = _child_text(entry, "description", "summary", "encoded", "content")
        published = _child_text(entry, "pubDate", "published", "updated", "date")
        articles.append(
            _article_row(
                title=title,
                summary=_clean_text(summary)[:600],
                publisher=source_name,
                url=url,
                published_at=_published_at(published),
                fetched_at=fetched_at,
                source_key=f"rss:{source_name.casefold()}",
                instruments=[],
            )
        )
    return articles


def _tag_rss_relevance(
    article: dict[str, object], instruments: list[dict[str, str]]
) -> dict[str, object] | None:
    text = f"{article['title']} {article.get('summary') or ''}".casefold()
    matched = []
    for instrument in instruments:
        symbol = re.sub(r"\.(NS|BO)$", "", instrument["ticker"], flags=re.IGNORECASE)
        if symbol and re.search(rf"(?<![\w]){re.escape(symbol.casefold())}(?![\w])", text):
            matched.append(instrument)
            continue
        name = re.sub(r"\s+", " ", instrument["instrument_name"].casefold()).strip()
        if len(name) >= 6 and name in text:
            matched.append(instrument)
    is_market_context = bool(
        re.search(r"\b(nifty|sensex|stock market|equity markets|rbi|sebi|inflation|"
                  r"interest rate|repo rate|indian markets|market outlook)\b", text)
    )
    if not matched and not is_market_context:
        return None
    article["ticker"] = ", ".join(item["ticker"] for item in matched) or "MARKET"
    article["instrument_name"] = ", ".join(
        item["instrument_name"] for item in matched
    ) or "Indian market context"
    article["asset_type"] = ", ".join(dict.fromkeys(
        item["asset_type"] for item in matched
    )) or "market"
    article["related_tickers"] = [item["ticker"] for item in matched]
    return article


def _article_row(
    *,
    title: str,
    summary: str,
    publisher: str,
    url: str | None,
    published_at: str | None,
    fetched_at: str,
    source_key: str,
    instruments: list[dict[str, str]],
) -> dict[str, object]:
    stable_key = url or f"{title.casefold()}:{publisher.casefold()}:{published_at or ''}"
    article_id = hashlib.sha256(stable_key.encode()).hexdigest()
    related_tickers = [item["ticker"] for item in instruments]
    return {
        "id": article_id,
        "ticker": ", ".join(related_tickers) or "MARKET",
        "instrument_name": ", ".join(
            item["instrument_name"] for item in instruments
        ) or "Indian market context",
        "asset_type": ", ".join(dict.fromkeys(
            item["asset_type"] for item in instruments
        )) or "market",
        "title": title.strip(),
        "publisher": publisher,
        "summary": summary or None,
        "url": url,
        "published_at": published_at,
        "fetched_at": fetched_at,
        "source_key": source_key,
        "related_tickers": related_tickers,
    }


def _merge_articles(
    destination: dict[str, dict[str, object]], items: list[dict[str, object]]
) -> None:
    for item in items:
        article_id = str(item["id"])
        if article_id not in destination:
            destination[article_id] = item
            continue
        previous = destination[article_id]
        previous_tags = set(previous.get("related_tickers", []))
        previous_tags.update(item.get("related_tickers", []))
        previous["related_tickers"] = sorted(previous_tags)
        previous["ticker"] = ", ".join(sorted(previous_tags)) or "MARKET"
        if item.get("summary") and not previous.get("summary"):
            previous["summary"] = item["summary"]


def _safe_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    url = value.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        return None
    return url


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _clean_text(value: object) -> str:
    raw = str(value or "")
    extractor = _TextExtractor()
    try:
        extractor.feed(raw)
        return re.sub(r"\s+", " ", " ".join(extractor.parts)).strip()
    except Exception:
        return re.sub(r"<[^>]+>", " ", raw).strip()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].split(":")[-1].casefold()


def _child_text(element: ElementTree.Element, *names: str) -> str:
    wanted = {name.casefold() for name in names}
    for child in element.iter():
        if child is element or _local_name(child.tag) not in wanted:
            continue
        if child.text and child.text.strip():
            return child.text.strip()
    return ""


def _published_at(value: object) -> str | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, UTC).isoformat()
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value.strip())
        except (TypeError, ValueError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


def _market_from_kite_id(holding_id: str) -> str | None:
    parts = holding_id.split(":")
    return parts[1].upper() if len(parts) >= 3 and parts[0] == "kite-equity" else None
