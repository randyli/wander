import { MessageType, isToolCallMessage } from '@shared/messages'
import { domGetText, domGetHTML, domClick, domFill, domSubmit, domWaitFor } from './tools/dom'
import type { DomGetTextParams } from './tools/dom'
import { pageScroll } from './tools/page'
import { navBack, navForward, navGoto } from './tools/nav'
import { netFetch } from './tools/net'

export interface StructuredToolResult {
  ok: boolean
  result: unknown
  errorCode?: string
  errorMessage?: string
}

function getErrorCode(error: unknown): string {
  const explicitCode = (error as { code?: unknown })?.code
  if (typeof explicitCode === 'string' && explicitCode) return explicitCode

  const message = error instanceof Error ? error.message : String(error)
  if (/element not found|form not found/i.test(message)) return 'ELEMENT_NOT_FOUND'
  if (/not visible/i.test(message)) return 'ELEMENT_NOT_VISIBLE'
  if (/timeout|timed out/i.test(message)) return 'TOOL_TIMEOUT'
  if (/cannot execute tools|restricted|chrome:\/\/|chrome-extension:\/\//i.test(message)) return 'RESTRICTED_URL'
  if (/page is still loading|page.*not.*loaded/i.test(message)) return 'PAGE_NOT_LOADED'
  if (/captcha|cloudflare|verify you are human|access denied|403/i.test(message)) return 'CAPTCHA_OR_CLOUDFLARE'
  if (/invalid selector/i.test(message)) return 'INVALID_SELECTOR'
  return 'TOOL_ERROR'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function executeTool(tool: string, params: Record<string, unknown>): Promise<unknown> {
  switch (tool) {
    case 'dom.getText':  return domGetText(params as DomGetTextParams)
    case 'dom.getHTML':  return domGetHTML(params as { selector: string })
    case 'dom.click':    return domClick(params as { selector: string; timeout?: number })
    case 'dom.fill':     return domFill(params as { selector: string; value: string; timeout?: number })
    case 'dom.submit':   return domSubmit(params as { selector?: string })
    case 'dom.waitFor':  return domWaitFor(params as { selector: string; timeout?: number; visible?: boolean })
    case 'page.scroll':  return pageScroll(params as { x: number; y: number })
    case 'nav.goto':     return navGoto(params as { url: string })
    case 'nav.back':     return navBack()
    case 'nav.forward':  return navForward()
    case 'net.fetch':
    case 'finance.stooq':
    case 'finance.coingecko':
    case 'finance.frankfurter':
    case 'finance.fiscaldata':
    case 'finance.sec':  return netFetch(params as { url: string; options?: RequestInit })
    default:             throw new Error(`Unknown tool: ${tool}`)
  }
}

export async function handleToolCall(tool: string, params: Record<string, unknown>): Promise<StructuredToolResult> {
  try {
    const result = await executeTool(tool, params)
    return { ok: true, result }
  } catch (error) {
    return {
      ok: false,
      result: null,
      errorCode: getErrorCode(error),
      errorMessage: getErrorMessage(error),
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isToolCallMessage(message)) return false
  handleToolCall(message.payload.tool, message.payload.params)
    .then(result => sendResponse({ type: MessageType.TOOL_RESULT, requestId: message.requestId, payload: result }))
  return true
})
