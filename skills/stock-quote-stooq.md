---
name: stock-quote-stooq
type: skill
description: Fetch delayed stock, ETF, index, futures, and FX quote snapshots from Stooq CSV endpoints
tool: net.fetch
parameters:
  url: string
---

Fetch public, read-only quote snapshots from Stooq's CSV quote endpoint. Use this skill when the user asks for a recent quote, open/high/low/close, volume, or basic price move for listed securities or Stooq-supported symbols.

**Allowed base URL**: only call `https://stooq.com/q/l/...` with GET-style public query parameters. Do not use this skill for authenticated requests, broker actions, account data, trading, order placement, or private portfolio data.

**Common read-only requests**:
- U.S. stock or ETF quote: `https://stooq.com/q/l/?s=AAPL.US&f=sd2t2ohlcv&h&e=csv`
- Multiple symbols: `https://stooq.com/q/l/?s=AAPL.US,MSFT.US,SPY.US&f=sd2t2ohlcv&h&e=csv`
- Index or futures symbols should use the Stooq symbol format supplied or confirmed by the user.

**Workflow**:
1. URL-encode all symbols and comma-separated symbol lists before constructing the `url`.
2. For common U.S. equities and ETFs, append `.US` when the user gives a bare U.S. ticker and does not specify another exchange.
3. Keep symbol lists small by default, usually 10 or fewer symbols, unless the user explicitly requests more.
4. Parse the CSV header and rows, and report `Date`, `Time`, `Open`, `High`, `Low`, `Close`, and `Volume` fields when present.
5. Treat `N/D`, empty responses, or missing rows as unavailable data and ask the user for a more precise Stooq symbol.
6. Clearly label Stooq quote data as a snapshot that may be delayed or unavailable for some instruments.
