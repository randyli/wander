export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface LLMMessage {
  role: Role
  content: string
  toolCallId?: string
  toolName?: string
  rawToolCalls?: unknown  // Provider-specific tool_calls for replay (OpenAI)
}

export interface ToolParameter {
  type: string
  description?: string
}

export type ToolRisk = 'read' | 'navigate' | 'write' | 'submit' | 'sensitive'

export interface Tool {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
  risk: ToolRisk
}

export interface ToolCall {
  id: string
  name: string
  params: Record<string, unknown>
}

export interface LLMResponse {
  content: string
  toolCalls: ToolCall[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  thinking?: string
  rawAssistantMessage?: unknown
}

export interface AgentDef {
  name: string
  description: string
  skills: string[]
  llm: string
  systemPrompt: string
}

export interface SkillDef {
  name: string
  description: string
  tool: string
  parameters: Record<string, string>
  instructions: string
}

export interface WorkingMemory {
  taskId: string
  messages: LLMMessage[]
  toolCallLog: Array<{ tool: string; params: unknown; result: unknown; ts: number }>
}

export interface Episode {
  id: string
  summary: string
  domain: string
  tags: string[]
  createdAt: number
}

export interface KnowledgeEntry {
  key: string
  value: string
  tags: string[]
  domain?: string
  updatedAt: number
}

export interface ProviderConfig {
  name?: string
  apiKey: string
  baseUrl?: string
  modelNames: string[]
  enabled: boolean
}

export interface GeneralSettingsConfig {
  provider: string
  model: string
  maxToolCallsPerTask: number
  maxEpisodes: number
  enableHistoryMemory: boolean
  enableBookmarkMemory: boolean
  memoryRetentionDays: number
}

export interface TaskState {
  taskId: string
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
  error?: string
}
