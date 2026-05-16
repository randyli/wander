---
name: treasury-data-fiscaldata
type: skill
description: Fetch public U.S. Treasury datasets from the Fiscal Data API
tool: net.fetch
parameters:
  url: string
---

Fetch public, read-only U.S. Treasury data from the Fiscal Data API. Use this skill when the user asks about U.S. Treasury fiscal datasets, debt, interest rates, auctions, statements, or other Treasury-published time series available through Fiscal Data.

**Allowed base URL**: only call `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/...` with GET-style public endpoints. Do not use this skill for authenticated requests, private taxpayer data, payments, or non-public government systems.

**Common read-only requests**:
- Latest average interest rate on Treasury securities: `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=1`
- Average interest rates with fields: `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?fields=record_date,security_desc,avg_interest_rate_amt&sort=-record_date&page[size]=20`
- Public debt outstanding: `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1`
- Treasury auctions: `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?sort=-auction_date&page[size]=20`

**Workflow**:
1. Choose the narrowest dataset endpoint that matches the user's Treasury question.
2. Use `fields`, `filter`, `sort`, and `page[size]` to keep responses concise.
3. URL-encode filters and field lists, especially comparison operators and dates.
4. Report `record_date`, units, dataset name, pagination context, and important fields from the response.
5. If the question requires a dataset you do not know, ask the user for the Fiscal Data endpoint or search terms rather than inventing an endpoint.
6. Treat Fiscal Data values as official published data, but note reporting lags and revisions when relevant.
