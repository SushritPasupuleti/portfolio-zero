# Portfolio news and local AI reports

## News sources

The News & reports page can combine two independently controlled sources:

- **Market RSS:** optional public feeds from Economic Times Markets and Stocks, Moneycontrol Market Reports, Business Standard Markets, and Mint Markets. RSS items are retained when a held ticker/name appears or when a headline covers broad Indian-market context such as Nifty, Sensex, RBI, SEBI, inflation, or rates. These are news sources, not market-price feeds.
- **Yahoo portfolio headlines:** optional headline lookup for supported holdings through `yfinance`. It requires the Yahoo access acknowledgement already used for Yahoo price sync, and follows the same caveat in [market-data-sources.md](market-data-sources.md): this is not an official Yahoo API and use is subject to Yahoo's current terms.

Both are off unless enabled in Settings. Refresh is user-triggered. The lookback window and maximum article count apply to the page and AI context. Refreshes are limited per source to once every 30 minutes; the app reuses its SQLite cache within that window. Article URLs are deduplication keys, related tickers are merged, and old rows are pruned after 30 days. Source refresh timestamps are stored separately in `news_source_meta`. Changing the lookback or article limit changes what is returned, not the cache retention period.

The app stores headline, publisher, summary when available, URL, publication/fetch times, source key, asset label, and matched tickers in `news_articles`. RSS feed text is parsed as data and rendered as text. It does not execute embedded HTML. If a source is unavailable, the previous cache remains available and the News page reports the refresh state.

The RSS source list and caching approach were informed by the public [Stock EZ settings](https://github.com/SushritPasupuleti/stock-ez/blob/main/src/config/settings.py), [RSS fetcher](https://github.com/SushritPasupuleti/stock-ez/blob/main/src/data_sources/news.py), and [SQLite news cache](https://github.com/SushritPasupuleti/stock-ez/blob/main/src/data_sources/news_cache.py). This app has its own source list, matching rules, and storage implementation.

## Local AI analysis

The dashboard sends a bounded portfolio snapshot and, when present, recent cached news to the configured Ollama-compatible local endpoint only after the user requests a report. The analyst prompt follows the evidence-first organization used in [Stock EZ's analyst prompt](https://github.com/SushritPasupuleti/stock-ez/blob/main/src/agent/prompts.py), adapted to this app's read-only portfolio scope.

Portfolio analysis asks for an executive summary, portfolio composition, buy/add, hold, and sell/reduce review, holding-level observations, market/news context, risks, data gaps, and other useful insights. It includes an explicit equal-weight scenario calculated by the backend within each currency: only positions with quantity and a price dated within seven days are sized, and the proposed unit difference is calculated from the value gap divided by the latest price. Missing/stale data is marked not sized. This is an illustrative comparison, not a personalized target; it does not account for cash, goals, risk tolerance, taxes, liquidity, or fees. The model must preserve the scenario quantities and avoid inventing a budget or extra unit counts. News reports group coverage by matched holding or broad-market theme, then separate reported facts from possible implications. Model claims should refer to supplied positions, dates, publishers, headlines, and exact story URLs; missing summaries or stale prices should be called out. Prompts treat imported names and article content as untrusted evidence and prohibit invented facts, causal claims, return forecasts, and order instructions.

Reports are Markdown strings returned by the API and rendered in the React UI using a safe component renderer: raw HTML is not injected, and links are restricted to HTTP(S). Each generated report is persisted in the local `ai_reports` SQLite table with structured run metadata, including model, local endpoint, input source counts, snapshot time, and news window. A `## Run metadata` Markdown table is appended to the bottom of every new report and is included in exports. The AI Insights and News & reports pages list saved reports and can open and export any report as a `.md` file. AI output is informational, can be wrong, and is not investment advice. No AI endpoint can change a Zerodha account or manual position.

## Broader market research ideas

The News & reports page can generate a separate Stock & fund ideas report. It fetches a dedicated set of broad-market RSS sources (Reuters Business, CNBC Markets, MarketWatch, Economic Times, and Moneycontrol) into the existing local SQLite news cache, independently of the portfolio ticker matching. The model may identify named instruments only when the supplied stories identify them; otherwise it should describe a research theme or fund category. The report is evidence-linked and includes risks and validation gaps. It is not a buy/sell recommendation. Each broader source uses the same 30-minute fetch cache and 30-day retention.

After a successful manual news refresh, the browser stores the local time of that check. If the page remains open, a toast appears once per tab when four hours have elapsed. This is a browser reminder, not a background notification.
