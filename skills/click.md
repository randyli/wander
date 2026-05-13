---
name: click
type: skill
description: Click an element on the current page
tool: dom.click
parameters:
  selector: string
  timeout: number
---

Click the visible element matching the CSS selector, waiting up to `timeout` milliseconds if provided. Use this to click buttons, links, video cards, and any interactive elements on the page. You may append `:has-text("visible text")` to narrow matches by visible text, for example `a[href*="question"]:has-text("Question title")`.
