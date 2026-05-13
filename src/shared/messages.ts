import type { ToolRisk } from './types'

export enum MessageType {
  USER_MESSAGE = 'USER_MESSAGE',
  LIST_AGENTS = 'LIST_AGENTS',
  INSTALL_AGENT = 'INSTALL_AGENT',
  DELETE_AGENT = 'DELETE_AGENT',
  LIST_SKILLS = 'LIST_SKILLS',
  INSTALL_SKILL = 'INSTALL_SKILL',
  DELETE_SKILL = 'DELETE_SKILL',
  LIST_EPISODES = 'LIST_EPISODES',
  DELETE_EPISODE = 'DELETE_EPISODE',
  LIST_KNOWLEDGE = 'LIST_KNOWLEDGE',
  DELETE_KNOWLEDGE = 'DELETE_KNOWLEDGE',
  GET_HISTORY = 'GET_HISTORY',
  CLEAR_HISTORY = 'CLEAR_HISTORY',
  GET_SESSION_MEMORY = 'GET_SESSION_MEMORY',
  GET_SYSTEM_MEMORY = 'GET_SYSTEM_MEMORY',
  GET_PROVIDERS = 'GET_PROVIDERS',
  SET_PROVIDER = 'SET_PROVIDER',
  REMOVE_PROVIDER = 'REMOVE_PROVIDER',
  GET_GENERAL_SETTINGS = 'GET_GENERAL_SETTINGS',
  UPDATE_GENERAL_SETTINGS = 'UPDATE_GENERAL_SETTINGS',
  RESET_GENERAL_SETTINGS = 'RESET_GENERAL_SETTINGS',
  AGENT_MESSAGE = 'AGENT_MESSAGE',
  TASK_STATUS = 'TASK_STATUS',
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
  payload: { text: string }
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
  payload: { result: unknown; error?: string }
}

export interface ResponseMessage extends BaseMessage {
  type: MessageType.RESPONSE
  payload: unknown
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
  | UserMessage | AgentMessage | ToolCallMessage | ToolResultMessage | ResponseMessage
  | ToolApprovalRequestMessage | ToolApprovalResponseMessage

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
