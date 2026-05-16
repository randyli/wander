---
name: sec-companyfacts
type: skill
description: Fetch public SEC EDGAR company facts and ticker-CIK mappings for U.S. issuers
tool: net.fetch
parameters:
  url: string
---

Fetch public, read-only SEC EDGAR company facts and ticker-to-CIK metadata. Use this skill when the user asks for U.S. public-company reported fundamentals, XBRL facts, fiscal periods, or SEC ticker/CIK lookups.

**Allowed base URLs**: only call public SEC data endpoints under `https://www.sec.gov/files/...` and `https://data.sec.gov/api/xbrl/...` with GET-style public endpoints. Do not use this skill for filing submissions, authenticated requests, material non-public information, or investment transactions.

**Common read-only requests**:
- Ticker to CIK mapping: `https://www.sec.gov/files/company_tickers.json`
- Company facts by padded CIK: `https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json`
- Single company concept: `https://data.sec.gov/api/xbrl/companyconcept/CIK0000320193/us-gaap/Revenues.json`

**Workflow**:
1. If the user gives a ticker rather than a CIK, fetch `company_tickers.json` first and find the matching ticker case-insensitively.
2. Pad CIKs to 10 digits in SEC endpoint paths, for example Apple CIK `320193` becomes `CIK0000320193`.
3. For broad financial statement questions, use `companyfacts` and extract relevant `us-gaap` facts by unit, fiscal year, fiscal period, form, filed date, and frame.
4. For a single metric, prefer `companyconcept` when the taxonomy tag is known.
5. Report the taxonomy tag, unit, fiscal period, form type, filed date, and whether a value is annual, quarterly, or trailing context when available.
6. If multiple tags could match a user's metric, list the plausible tags and ask which one to use instead of silently choosing.
7. Note that SEC data is reported historical information and may lag company announcements or market data.
