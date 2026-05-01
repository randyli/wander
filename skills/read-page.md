---
name: read-page
type: skill
description: Read the visible text content of the current page or a specific element
tool: dom.getText
parameters:
  selector: string
---

Reads visible text from the current page. Provide a CSS selector to target a specific element, or omit to read the entire page body.
