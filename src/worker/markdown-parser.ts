import matter from 'gray-matter'
import type { AgentDef, SkillDef } from '@shared/types'

export function parseAgentMarkdown(markdown: string): AgentDef {
  const { data, content } = matter(markdown)
  return {
    name: String(data.name),
    description: String(data.description ?? ''),
    skills: Array.isArray(data.skills) ? data.skills.map(String) : [],
    llm: String(data.llm ?? ''),
    systemPrompt: content.trim(),
  }
}

export function parseSkillMarkdown(markdown: string): SkillDef {
  const { data, content } = matter(markdown)
  const parameters: Record<string, string> = {}
  if (data.parameters && typeof data.parameters === 'object') {
    for (const [k, v] of Object.entries(data.parameters)) {
      parameters[k] = String(v)
    }
  }
  return {
    name: String(data.name),
    description: String(data.description ?? ''),
    tool: String(data.tool ?? ''),
    parameters,
    instructions: content.trim(),
  }
}
