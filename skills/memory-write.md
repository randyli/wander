---
name: memory-write
type: skill
description: Save a key-value pair to shared knowledge for future reference
tool: memory.set
parameters:
  key: string
  value: string
  tags: string
---

Stores a fact in shared knowledge. Key should be descriptive (e.g., "user.preference.theme"). Tags are comma-separated labels. Persists across sessions and is readable by all agents.
