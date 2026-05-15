---
name: polymarket
type: skill
description: Fetch read-only Polymarket public market data from the Gamma API
tool: net.fetch
parameters:
  url: string
---

Fetch public, read-only Polymarket data for market discovery and summarization. Use this skill when the user asks about Polymarket markets, odds, prices, outcomes, event pages, slugs, volume, liquidity, end dates, or resolution information.

**Allowed base URL**: only call `https://gamma-api.polymarket.com/...` with GET-style public endpoints. Do not use this skill for trading, wallet operations, authenticated requests, order placement, cancellations, or private account data.

**Common read-only requests**:
- Search markets/events/profiles: `https://gamma-api.polymarket.com/public-search?q=QUERY`
- List active open markets: `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=20`
- Fetch a market by slug: `https://gamma-api.polymarket.com/markets/slug/MARKET_SLUG`
- Fetch an event by slug: `https://gamma-api.polymarket.com/events/slug/EVENT_SLUG`

**Workflow**:
1. URL-encode user queries and slug values before constructing the `url`.
2. Prefer `public-search` first when the user gives natural-language text instead of an exact slug.
3. Use a small `limit` value for list endpoints unless the user explicitly asks for broad coverage.
4. Summarize probabilities/prices as market-implied information, not factual certainty or financial advice.
5. Mention important caveats from the response such as `closed`, `archived`, `endDate`, volume/liquidity, and resolution status when present.
6. If a response is empty, too large, blocked, or not valid JSON, report that plainly and suggest checking the market page manually.
