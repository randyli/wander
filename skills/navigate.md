---
name: navigate
type: skill
description: Navigate the browser — go to a URL, open a new tab, or go back/forward
tool: nav.goto
parameters:
  url: string
  new_tab: string
  direction: string
---

Navigate the browser:
- To go to a URL in the current tab: provide `url`
- To open a URL in a new tab: provide `url` and set `new_tab` to "true"
- To go back or forward: provide `direction` as "back" or "forward"
