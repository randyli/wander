import { MessageType } from '@shared/messages'
import type { ToolRisk } from '@shared/types'

export const HIGH_RISK_TOOLS: Record<string, ToolRisk> = {
  'dom.fill': 'sensitive',
  'dom.submit': 'submit',
  'nav.goto': 'navigate',
  'history.search': 'sensitive',
  'page.screenshot': 'sensitive',
}

const DEFAULT_TOOL_APPROVAL_TIMEOUT_MS = 30_000

export interface ToolApprovalDetails {
  tool: string
  params: Record<string, unknown>
  targetUrl?: string
  risk: ToolRisk
}

export interface ToolApprovalResult {
  approved: boolean
  reason?: string
}

export interface ToolApprovalError {
  ok: false
  error: {
    code: 'TOOL_APPROVAL_DENIED' | 'TOOL_APPROVAL_TIMEOUT'
    message: string
    tool: string
    risk: ToolRisk
    targetUrl?: string
  }
}

export function normalizeToolName(tool: string): string {
  return tool.replace(/_/g, '.')
}

export function getToolRisk(tool: string): ToolRisk {
  const normalized = normalizeToolName(tool)
  if (HIGH_RISK_TOOLS[normalized]) return HIGH_RISK_TOOLS[normalized]
  if (normalized.startsWith('nav.')) return 'navigate'
  if (normalized.startsWith('memory.set')) return 'write'
  return 'read'
}

export function requiresToolApproval(tool: string): boolean {
  return normalizeToolName(tool) in HIGH_RISK_TOOLS
}

export function createToolApprovalError(
  details: ToolApprovalDetails,
  code: ToolApprovalError['error']['code'],
  message: string,
): ToolApprovalError {
  return {
    ok: false,
    error: {
      code,
      message,
      tool: details.tool,
      risk: details.risk,
      targetUrl: details.targetUrl,
    },
  }
}

export function requestToolApproval(
  details: ToolApprovalDetails,
  timeoutMs = DEFAULT_TOOL_APPROVAL_TIMEOUT_MS,
): Promise<ToolApprovalResult> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ approved: false, reason: 'Approval timed out' })
    }, timeoutMs)

    chrome.runtime.sendMessage({
      type: MessageType.TOOL_APPROVAL_REQUEST,
      requestId: crypto.randomUUID(),
      payload: details,
    }, response => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      if (chrome.runtime.lastError) {
        resolve({ approved: false, reason: chrome.runtime.lastError.message })
        return
      }

      const payload = (response as { payload?: ToolApprovalResult } | undefined)?.payload
      resolve({
        approved: Boolean(payload?.approved),
        reason: payload?.reason,
      })
    })
  })
}
