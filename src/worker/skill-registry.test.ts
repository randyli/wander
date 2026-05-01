import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { SkillRegistry } from './skill-registry'

const skillMd = `---
name: read-page
type: skill
description: Read page text
tool: dom.getText
parameters:
  selector: string
---
Returns visible text content.`

describe('SkillRegistry', () => {
  let registry: SkillRegistry

  beforeEach(async () => {
    registry = new SkillRegistry()
    await registry.init()
  })

  it('installs and retrieves a skill', async () => {
    await registry.install(skillMd)
    const skill = await registry.get('read-page')
    expect(skill?.tool).toBe('dom.getText')
  })

  it('lists all skills', async () => {
    await registry.install(skillMd)
    expect((await registry.list()).some(s => s.name === 'read-page')).toBe(true)
  })

  it('deletes a skill', async () => {
    await registry.install(skillMd)
    await registry.delete('read-page')
    expect(await registry.get('read-page')).toBeUndefined()
  })
})
