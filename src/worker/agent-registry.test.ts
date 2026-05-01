import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { AgentRegistry } from './agent-registry'

const agentMd = `---
name: researcher
type: agent
description: Researches pages
skills:
  - read-page
llm: claude-opus-4-7
---
You research web pages.`

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(async () => {
    registry = new AgentRegistry()
    await registry.init()
  })

  it('installs and retrieves an agent', async () => {
    await registry.install(agentMd)
    const agent = await registry.get('researcher')
    expect(agent?.llm).toBe('claude-opus-4-7')
    expect(agent?.skills).toContain('read-page')
  })

  it('lists all agents', async () => {
    await registry.install(agentMd)
    expect((await registry.list()).some(a => a.name === 'researcher')).toBe(true)
  })

  it('deletes an agent', async () => {
    await registry.install(agentMd)
    await registry.delete('researcher')
    expect(await registry.get('researcher')).toBeUndefined()
  })
})
