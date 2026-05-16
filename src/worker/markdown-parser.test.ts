import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { parseAgentMarkdown, parseSkillMarkdown } from './markdown-parser'

const agentMd = `---
name: web-researcher
type: agent
description: Researches web pages
skills:
  - read-page
  - take-screenshot
llm: claude-opus-4-7
---

You are a web researcher. When given a research task, browse and summarize.`

const skillMd = `---
name: read-page
type: skill
description: Read current page text
tool: dom.getText
parameters:
  selector: string
---

Call this skill to get visible text from the page.`

describe('parseAgentMarkdown', () => {
  it('parses name and description', () => {
    const agent = parseAgentMarkdown(agentMd)
    expect(agent.name).toBe('web-researcher')
    expect(agent.description).toBe('Researches web pages')
  })

  it('parses skills list', () => {
    const agent = parseAgentMarkdown(agentMd)
    expect(agent.skills).toEqual(['read-page', 'take-screenshot'])
  })

  it('parses llm and system prompt', () => {
    const agent = parseAgentMarkdown(agentMd)
    expect(agent.llm).toBe('claude-opus-4-7')
    expect(agent.systemPrompt).toContain('web researcher')
  })
})

describe('parseSkillMarkdown', () => {
  it('parses name and tool', () => {
    const skill = parseSkillMarkdown(skillMd)
    expect(skill.name).toBe('read-page')
    expect(skill.tool).toBe('dom.getText')
  })

  it('parses parameters', () => {
    const skill = parseSkillMarkdown(skillMd)
    expect(skill.parameters).toEqual({ selector: 'string' })
  })

  it('parses instructions from body', () => {
    const skill = parseSkillMarkdown(skillMd)
    expect(skill.instructions).toContain('visible text')
  })

  it('keeps built-in finance skill tool names unique', () => {
    const financeSkillPaths = [
      'skills/stock-quote-stooq.md',
      'skills/crypto-price-coingecko.md',
      'skills/fx-rates-frankfurter.md',
      'skills/treasury-data-fiscaldata.md',
      'skills/sec-companyfacts.md',
    ]
    const tools = financeSkillPaths.map(path => parseSkillMarkdown(readFileSync(path, 'utf8')).tool)

    expect(new Set(tools).size).toBe(tools.length)
    expect(tools).toEqual([
      'finance.stooq',
      'finance.coingecko',
      'finance.frankfurter',
      'finance.fiscaldata',
      'finance.sec',
    ])
  })
})
