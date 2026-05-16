---
name: fx-rates-frankfurter
type: skill
description: Fetch fiat exchange rates and historical conversions from the Frankfurter public API
tool: net.fetch
parameters:
  url: string
---

Fetch public, read-only fiat foreign-exchange rates from Frankfurter. Use this skill when the user asks for fiat currency exchange rates, conversions, or historical fiat rate comparisons.

**Allowed base URL**: only call `https://api.frankfurter.app/...` with GET-style public endpoints. Do not use this skill for trading, broker actions, remittances, authenticated requests, or private account data.

**Common read-only requests**:
- Latest rates: `https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP`
- Convert amount: `https://api.frankfurter.app/latest?amount=100&from=USD&to=EUR`
- Historical date: `https://api.frankfurter.app/2024-12-31?from=USD&to=EUR`
- Time series: `https://api.frankfurter.app/2024-01-01..2024-01-31?from=USD&to=EUR`
- Supported currencies: `https://api.frankfurter.app/currencies`

**Workflow**:
1. Use ISO 4217 fiat currency codes and uppercase them before constructing the `url`.
2. URL-encode all query parameters and keep target currency lists small unless the user requests broad coverage.
3. Use `latest` for current rate questions, a specific `YYYY-MM-DD` path for historical questions, and a `START..END` path for time series.
4. Report the API's `date`, `base`, requested amount, and returned `rates`.
5. If asked to convert, show the formula briefly and round sensibly while preserving the API value when useful.
6. If a currency is unsupported or the response is empty, ask for a supported fiat currency code.
