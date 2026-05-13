---
name: read-page
type: skill
description: Read the visible text content of the current page or a specific element
tool: dom.getText
parameters:
  selector: string
  maxLength: number
  includeLinks: boolean
  includeForms: boolean
---

Reads visible text from the current page. Provide a CSS selector to target a specific element, or omit to read the entire page body. Use `maxLength` to limit very long pages. Set `includeLinks` to include a compact link list and `includeForms` to include a compact form/field summary when you need selectors or navigation targets.
