import type { ToolRisk } from './types'

export enum MessageType {
  USER_MESSAGE = 'USER_MESSAGE',
  STREAM_CHUNK = 'STREAM_CHUNK',
  CANCEL_TASK = 'CANCEL_TASK',
  CREATE_CONVERSATION = 'CREATE_CONVERSATION',
  SWITCH_CONVERSATION = 'SWITCH_CONVERSATION',
  LIST_AGENTS = 'LIST_AGENTS',
  INSTALL_AGENT = 'INSTALL_AGENT',
  DELETE_AGENT = 'DELETE_AGENT',
  LIST_SKILLS = 'LIST_SKILLS',
  INSTALL_SKILL = 'INSTALL_SKILL',
  DELETE_SKILL = 'DELETE_SKILL',
  LIST_EPISODES = 'LIST_EPISODES',
  DELETE_EPISODE = 'DELETE_EPISODE',
  DELETE_EPISODES_BY_TAG = 'DELETE_EPISODES_BY_TAG',
  DELETE_EPISODES_BY_DOMAIN = 'DELETE_EPISODES_BY_DOMAIN',
  CLEAR_EPISODES = 'CLEAR_EPISODES',
  EXPORT_EPISODES = 'EXPORT_EPISODES',
  LIST_KNOWLEDGE = 'LIST_KNOWLEDGE',
  DELETE_KNOWLEDGE = 'DELETE_KNOWLEDGE',
  DELETE_KNOWLEDGE_BY_TAG = 'DELETE_KNOWLEDGE_BY_TAG',
  DELETE_KNOWLEDGE_BY_DOMAIN = 'DELETE_KNOWLEDGE_BY_DOMAIN',
  CLEAR_KNOWLEDGE = 'CLEAR_KNOWLEDGE',
  EXPORT_KNOWLEDGE = 'EXPORT_KNOWLEDGE',
  GET_HISTORY = 'GET_HISTORY',
  CLEAR_HISTORY = 'CLEAR_HISTORY',
  GET_SESSION_MEMORY = 'GET_SESSION_MEMORY',
  GET_SYSTEM_MEMORY = 'GET_SYSTEM_MEMORY',
  GET_PROVIDERS = 'GET_PROVIDERS',
  SET_PROVIDER = 'SET_PROVIDER',
  REMOVE_PROVIDER = 'REMOVE_PROVIDER',
  GET_GENERAL_SETTINGS = 'GET_GENERAL_SETTINGS',
  GET_QUICK_ACTIONS = 'GET_QUICK_ACTIONS',
  GET_QUICK_ACTION_RECOMMENDATIONS = 'GET_QUICK_ACTION_RECOMMENDATIONS',
  UPDATE_GENERAL_SETTINGS = 'UPDATE_GENERAL_SETTINGS',
  RESET_GENERAL_SETTINGS = 'RESET_GENERAL_SETTINGS',
  AGENT_MESSAGE = 'AGENT_MESSAGE',
  TASK_STATUS = 'TASK_STATUS',
  TASK_EVENT = 'TASK_EVENT',
  RESPONSE = 'RESPONSE',
  TOOL_CALL = 'TOOL_CALL',
  TOOL_RESULT = 'TOOL_RESULT',
  TOOL_APPROVAL_REQUEST = 'TOOL_APPROVAL_REQUEST',
  TOOL_APPROVAL_RESPONSE = 'TOOL_APPROVAL_RESPONSE',
}

export interface BaseMessage {
  type: MessageType
  requestId: string
}

export interface UserMessage extends BaseMessage {
  type: MessageType.USER_MESSAGE
  payload: { text: string; conversationId?: string; taskId?: string }
}

export interface StreamChunkMessage extends BaseMessage {
  type: MessageType.STREAM_CHUNK
  payload: { taskId: string; conversationId?: string; text: string; done?: boolean }
}

export interface CancelTaskMessage extends BaseMessage {
  type: MessageType.CANCEL_TASK
  payload: { taskId: string }
}

export interface CreateConversationMessage extends BaseMessage {
  type: MessageType.CREATE_CONVERSATION
  payload?: { conversationId?: string }
}

export interface SwitchConversationMessage extends BaseMessage {
  type: MessageType.SWITCH_CONVERSATION
  payload: { conversationId: string }
}

export interface AgentMessage extends BaseMessage {
  type: MessageType.AGENT_MESSAGE
  payload: { text: string; agentName: string }
}

export interface ToolCallMessage extends BaseMessage {
  type: MessageType.TOOL_CALL
  payload: { tool: string; params: Record<string, unknown> }
}

export interface ToolResultMessage extends BaseMessage {
  type: MessageType.TOOL_RESULT
  payload: { ok?: boolean; result: unknown; error?: string; errorCode?: string; errorMessage?: string }
}

export type TaskEventType =
  | 'user_message'
  | 'llm_response'
  | 'tool_start'
  | 'tool_complete'
  | 'tool_error'
  | 'subagent_start'
  | 'subagent_complete'
  | 'subagent_error'
  | 'final_response'

export type TaskEventStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

export interface TaskEventPayload {
  taskId: string
  agentName: string
  eventType: TaskEventType
  toolName?: string
  params?: Record<string, unknown>
  status: TaskEventStatus
  summary?: string
}

export interface TaskEventMessage extends BaseMessage {
  type: MessageType.TASK_EVENT
  payload: TaskEventPayload
}

export interface ResponseMessage extends BaseMessage {
  type: MessageType.RESPONSE
  payload: unknown
}

export interface QuickAction {
  label: string
  prompt: string
  source?: 'user' | 'recommended' | 'default'
}

export interface GetQuickActionsMessage extends BaseMessage {
  type: MessageType.GET_QUICK_ACTIONS
  payload?: Record<string, never>
}

export interface GetQuickActionRecommendationsMessage extends BaseMessage {
  type: MessageType.GET_QUICK_ACTION_RECOMMENDATIONS
  payload?: Record<string, never>
}

export interface QuickActionsPayload {
  actions: QuickAction[]
}

export interface ToolApprovalRequestMessage extends BaseMessage {
  type: MessageType.TOOL_APPROVAL_REQUEST
  payload: { tool: string; params: Record<string, unknown>; targetUrl?: string; risk: ToolRisk }
}

export interface ToolApprovalResponseMessage extends BaseMessage {
  type: MessageType.TOOL_APPROVAL_RESPONSE
  payload: { approved: boolean; reason?: string }
}

export type ChromeMessage =
  | UserMessage | StreamChunkMessage | CancelTaskMessage | CreateConversationMessage | SwitchConversationMessage
  | AgentMessage | ToolCallMessage | ToolResultMessage | TaskEventMessage | ResponseMessage
  | GetQuickActionsMessage | GetQuickActionRecommendationsMessage | ToolApprovalRequestMessage | ToolApprovalResponseMessage

export function isToolCallMessage(msg: unknown): msg is ToolCallMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_CALL
}

export function isUserMessage(msg: unknown): msg is UserMessage {
  return (msg as BaseMessage)?.type === MessageType.USER_MESSAGE
}

export function isToolResultMessage(msg: unknown): msg is ToolResultMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_RESULT
}

export function isToolApprovalRequestMessage(msg: unknown): msg is ToolApprovalRequestMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_APPROVAL_REQUEST
}

export function isToolApprovalResponseMessage(msg: unknown): msg is ToolApprovalResponseMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_APPROVAL_RESPONSE
}

export function isTaskEventMessage(msg: unknown): msg is TaskEventMessage {
  return (msg as BaseMessage)?.type === MessageType.TASK_EVENT
}

export function isStreamChunkMessage(msg: unknown): msg is StreamChunkMessage {
  return (msg as BaseMessage)?.type === MessageType.STREAM_CHUNK
}
