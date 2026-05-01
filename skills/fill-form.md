---
name: fill-form
type: skill
description: Fill a form field and optionally submit the form
tool: dom.fill
parameters:
  selector: string
  value: string
  submit: string
---

Fills the input matching the CSS selector with the given value. Set submit to "true" to also submit the form after filling.
