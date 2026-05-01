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
  GET_CONFIG = 'GET_CONFIG',
  SET_CONFIG = 'SET_CONFIG',
  SET_API_KEY = 'SET_API_KEY',
  AGENT_MESSAGE = 'AGENT_MESSAGE',
  TASK_STATUS = 'TASK_STATUS',
  RESPONSE = 'RESPONSE',
  TOOL_CALL = 'TOOL_CALL',
  TOOL_RESULT = 'TOOL_RESULT',
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

export type ChromeMessage =
  | UserMessage | AgentMessage | ToolCallMessage | ToolResultMessage | ResponseMessage

export function isToolCallMessage(msg: unknown): msg is ToolCallMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_CALL
}

export function isUserMessage(msg: unknown): msg is UserMessage {
  return (msg as BaseMessage)?.type === MessageType.USER_MESSAGE
}

export function isToolResultMessage(msg: unknown): msg is ToolResultMessage {
  return (msg as BaseMessage)?.type === MessageType.TOOL_RESULT
}
