const HAS_TEXT_PATTERN = /:has-text\((?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\)/g

export class DomToolError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'DomToolError'
    this.code = code
  }
}

export interface DomGetTextParams {
  selector?: string
  maxLength?: number
  includeLinks?: boolean
  includeForms?: boolean
}

interface WaitableSelectorParams {
  selector: string
  timeout?: number
  visible?: boolean
}

function unescapeSelectorText(value: string): string {
  return value.replace(/\\(["'\\])/g, '$1')
}

function parseSelector(selector: string): { cssSelector: string; textFilters: string[] } {
  const textFilters: string[] = []
  const cssSelector = selector.replace(HAS_TEXT_PATTERN, (_match, doubleQuoted?: string, singleQuoted?: string, bare?: string) => {
    const raw = doubleQuoted ?? singleQuoted ?? bare ?? ''
    textFilters.push(unescapeSelectorText(raw.trim()))
    return ''
  }).trim() || '*'

  return { cssSelector, textFilters }
}

function queryAll(selector: string, root: ParentNode = document): Element[] {
  const { cssSelector, textFilters } = parseSelector(selector)
  let elements: Element[]

  try {
    elements = Array.from(root.querySelectorAll(cssSelector))
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    throw new DomToolError('INVALID_SELECTOR', `Invalid selector: ${selector}. Use a valid CSS selector; :has-text("text") is supported for text matching. ${details}`)
  }

  if (textFilters.length === 0) return elements

  return elements.filter(element => {
    const text = (element as HTMLElement).innerText ?? element.textContent ?? ''
    return textFilters.every(filter => text.includes(filter))
  })
}

function queryOne(selector: string, root?: ParentNode): Element | null {
  return queryAll(selector, root)[0] ?? null
}

function getElementText(element: Element): string {
  return (element as HTMLElement).innerText ?? element.textContent ?? ''
}

function truncateText(text: string, maxLength?: number): string {
  if (!maxLength || maxLength < 0 || text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}… [truncated ${text.length - maxLength} chars]`
}

function summarizeLinks(root: ParentNode): string {
  const links = Array.from(root.querySelectorAll('a[href]'))
    .map((link, index) => {
      const label = getElementText(link).trim() || link.getAttribute('aria-label') || `Link ${index + 1}`
      return `- ${label}: ${(link as HTMLAnchorElement).href || link.getAttribute('href')}`
    })
    .filter(Boolean)
  return links.length ? `\n\nLinks:\n${links.join('\n')}` : ''
}

function summarizeForms(root: ParentNode): string {
  const forms = Array.from(root.querySelectorAll('form'))
    .map((form, formIndex) => {
      const fields = Array.from(form.querySelectorAll('input, textarea, select, button'))
        .map((field) => {
          const el = field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
          const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || getElementText(field).trim() || field.tagName.toLowerCase()
          const type = field.tagName.toLowerCase() === 'input' ? (el as HTMLInputElement).type || 'text' : field.tagName.toLowerCase()
          return `${label} (${type})`
        })
      return `- Form ${formIndex + 1}${form.id ? ` #${form.id}` : ''}: ${fields.length ? fields.join(', ') : 'no fields'}`
    })
  return forms.length ? `\n\nForms:\n${forms.join('\n')}` : ''
}

function isVisible(element: Element): boolean {
  const html = element as HTMLElement
  if (html.hidden) return false
  const style = window.getComputedStyle(html)
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false
  if (html.getAttribute('aria-hidden') === 'true') return false
  return !html.closest('[hidden],[aria-hidden="true"]')
}

function isPageLikelyBlocked(): boolean {
  const text = (document.body?.innerText ?? document.body?.textContent ?? '').toLowerCase()
  return /captcha|verify you are human|cloudflare|access denied|checking your browser|403 forbidden/.test(text)
}

function assertPageReady(): void {
  if (document.readyState === 'loading') {
    throw new DomToolError('PAGE_NOT_LOADED', 'Page is still loading. Wait for the page to finish loading, then retry the tool call.')
  }
  if (isPageLikelyBlocked()) {
    throw new DomToolError('CAPTCHA_OR_CLOUDFLARE', 'Page appears blocked by CAPTCHA, Cloudflare, access denial, or human verification.')
  }
}

async function waitForElement({ selector, timeout = 5000, visible = false }: WaitableSelectorParams): Promise<Element> {
  const deadline = Date.now() + timeout
  while (true) {
    assertPageReady()
    const el = queryOne(selector)
    if (el && (!visible || isVisible(el))) return el
    if (Date.now() >= deadline) {
      if (el && visible) throw new DomToolError('ELEMENT_NOT_VISIBLE', `Element is not visible: ${selector}`)
      throw new DomToolError('TOOL_TIMEOUT', `Timeout waiting for: ${selector}`)
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

export function domGetText({ selector, maxLength, includeLinks = false, includeForms = false }: DomGetTextParams): string {
  assertPageReady()
  const root = selector ? queryOne(selector) : document.body
  if (!root) throw new DomToolError('ELEMENT_NOT_FOUND', `Element not found: ${selector}`)

  let text = getElementText(root)
  if (includeLinks) text += summarizeLinks(root)
  if (includeForms) text += summarizeForms(root)
  return truncateText(text, maxLength)
}

export function domGetHTML({ selector }: { selector: string }): string {
  assertPageReady()
  const el = queryOne(selector)
  if (!el) throw new DomToolError('ELEMENT_NOT_FOUND', `Element not found: ${selector}`)
  return el.innerHTML
}

export async function domClick({ selector, timeout = 5000 }: { selector: string; timeout?: number }): Promise<void> {
  const el = await waitForElement({ selector, timeout, visible: true })
  ;(el as HTMLElement).click()
}

export async function domFill({ selector, value, timeout = 5000 }: { selector: string; value: string; timeout?: number }): Promise<void> {
  const el = await waitForElement({ selector, timeout, visible: true })
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export function domSubmit({ selector }: { selector?: string }): void {
  assertPageReady()
  const el = selector ? queryOne(selector) : document.querySelector('form')
  if (!el) throw new DomToolError('ELEMENT_NOT_FOUND', `Form not found${selector ? `: ${selector}` : ''}`)
  ;(el as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

export async function domWaitFor({ selector, timeout = 5000, visible = false }: WaitableSelectorParams): Promise<void> {
  await waitForElement({ selector, timeout, visible })
}
