---
name: fill-form
type: skill
description: Fill a form field and optionally submit the form
tool: dom.fill
parameters:
  selector: string
  value: string
  timeout: number
  submit: string
---

Fills the visible input matching the CSS selector, waiting up to `timeout` milliseconds if provided. Set submit to "true" to also submit the form after filling.
