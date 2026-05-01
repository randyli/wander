export type LLMProvider = 'claude' | 'openai' | 'gemini' | 'deepseek' | 'qwen'
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

export interface Tool {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
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
  rawAssistantMessage?: unknown  // For providers that need it (OpenAI tool_calls replay)
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
  updatedAt: number
}

export interface GlobalConfig {
  defaultProvider: LLMProvider
  defaultModel: string
  maxToolCallsPerTask: number
  maxEpisodes: number
}

export interface TaskState {
  taskId: string
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
  error?: string
}
