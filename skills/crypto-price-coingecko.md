---
name: crypto-price-coingecko
type: skill
description: Fetch public cryptocurrency prices and market data from CoinGecko API endpoints
tool: net.fetch
parameters:
  url: string
---

Fetch public, read-only cryptocurrency market data from CoinGecko. Use this skill when the user asks for crypto prices, market caps, volume, 24-hour percentage changes, or simple coin lookup information.

**Allowed base URL**: only call `https://api.coingecko.com/api/v3/...` with GET-style public endpoints. Do not use this skill for trading, wallet operations, authenticated requests, or private account data.

**Common read-only requests**:
- Simple price: `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`
- Coin search: `https://api.coingecko.com/api/v3/search?query=QUERY`
- Coin market list: `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&price_change_percentage=24h,7d&per_page=20&page=1`

**Workflow**:
1. Use CoinGecko coin ids, not exchange tickers, in `ids`; search first when the id is uncertain.
2. URL-encode coin ids, search queries, and currency codes.
3. Prefer `simple/price` for direct price checks and `coins/markets` for rank, volume, market cap, and percentage-change summaries.
4. Keep requests small and focused to reduce public API rate-limit risk.
5. Report `last_updated_at`, quote currency, market cap, volume, and 24-hour change when available.
6. If the API returns a rate-limit, empty, or ambiguous result, state that plainly and ask for a clearer coin id or retry later.
