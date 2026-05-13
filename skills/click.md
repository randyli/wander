---
name: click
type: skill
description: Click an element on the current page
tool: dom.click
parameters:
  selector: string
---

Click the element matching the CSS selector. Use this to click buttons, links, video cards, and any interactive elements on the page. You may append `:has-text("visible text")` to narrow matches by visible text, for example `a[href*="question"]:has-text("Question title")`.
