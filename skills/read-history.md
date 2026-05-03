---
name: read-history
type: skill
description: Search browser history by keyword or retrieve recent visits
tool: history.search
parameters:
  query: string
  max_results: string
  days_back: string
---

Search the browser's visit history.
- `query`: keyword to search in URLs and page titles (leave empty to get recent visits)
- `max_results`: maximum number of results to return (default: 20)
- `days_back`: how many days back to search (default: 7)

Returns a list of visited pages with title, URL, and last visit time.
