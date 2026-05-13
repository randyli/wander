const HAS_TEXT_PATTERN = /:has-text\((?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\)/g

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
    throw new Error(`Invalid selector: ${selector}. Use a valid CSS selector; :has-text("text") is supported for text matching. ${details}`)
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

export function domGetText({ selector }: { selector?: string }): string {
  if (!selector) {
    return document.body.innerText ?? document.body.textContent ?? ''
  }
  const el = queryOne(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  return (el as HTMLElement).innerText ?? el.textContent ?? ''
}

export function domGetHTML({ selector }: { selector: string }): string {
  const el = queryOne(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  return el.innerHTML
}

export function domClick({ selector }: { selector: string }): void {
  const el = queryOne(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  ;(el as HTMLElement).click()
}

export function domFill({ selector, value }: { selector: string; value: string }): void {
  const el = queryOne(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export function domSubmit({ selector }: { selector?: string }): void {
  const el = selector ? queryOne(selector) : document.querySelector('form')
  if (!el) throw new Error(`Form not found${selector ? `: ${selector}` : ''}`)
  ;(el as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

export function domWaitFor({ selector, timeout }: { selector: string; timeout: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (queryOne(selector)) { resolve(); return }
    const deadline = Date.now() + timeout
    const interval = setInterval(() => {
      if (queryOne(selector)) {
        clearInterval(interval)
        resolve()
      } else if (Date.now() >= deadline) {
        clearInterval(interval)
        reject(new Error(`Timeout waiting for: ${selector}`))
      }
    }, 50)
  })
}
