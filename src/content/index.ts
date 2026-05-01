import { MessageType, isToolCallMessage } from '@shared/messages'
import { domGetText, domGetHTML, domClick, domFill, domSubmit, domWaitFor } from './tools/dom'
import { pageScroll } from './tools/page'
import { navBack, navForward, navGoto } from './tools/nav'
import { netFetch } from './tools/net'

export async function handleToolCall(tool: string, params: Record<string, unknown>): Promise<unknown> {
  switch (tool) {
    case 'dom.getText':  return domGetText(params as { selector?: string })
    case 'dom.getHTML':  return domGetHTML(params as { selector: string })
    case 'dom.click':    return domClick(params as { selector: string })
    case 'dom.fill':     return domFill(params as { selector: string; value: string })
    case 'dom.submit':   return domSubmit(params as { selector?: string })
    case 'dom.waitFor':  return domWaitFor(params as { selector: string; timeout: number })
    case 'page.scroll':  return pageScroll(params as { x: number; y: number })
    case 'nav.goto':     return navGoto(params as { url: string })
    case 'nav.back':     return navBack()
    case 'nav.forward':  return navForward()
    case 'net.fetch':    return netFetch(params as { url: string; options?: RequestInit })
    default:             throw new Error(`Unknown tool: ${tool}`)
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isToolCallMessage(message)) return false
  handleToolCall(message.payload.tool, message.payload.params)
    .then(result => sendResponse({ type: MessageType.TOOL_RESULT, requestId: message.requestId, payload: { result } }))
    .catch(error => sendResponse({ type: MessageType.TOOL_RESULT, requestId: message.requestId, payload: { result: null, error: String(error) } }))
  return true
})
