export function domGetText({ selector }: { selector?: string }): string {
  if (!selector) {
    return document.body.innerText ?? document.body.textContent ?? ''
  }
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  return (el as HTMLElement).innerText ?? (el as HTMLElement).textContent ?? ''
}

export function domGetHTML({ selector }: { selector: string }): string {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  return el.innerHTML
}

export function domClick({ selector }: { selector: string }): void {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  ;(el as HTMLElement).click()
}

export function domFill({ selector, value }: { selector: string; value: string }): void {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Element not found: ${selector}`)
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export function domSubmit({ selector }: { selector?: string }): void {
  const el = selector ? document.querySelector(selector) : document.querySelector('form')
  if (!el) throw new Error(`Form not found${selector ? `: ${selector}` : ''}`)
  ;(el as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

export function domWaitFor({ selector, timeout }: { selector: string; timeout: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) { resolve(); return }
    const deadline = Date.now() + timeout
    const interval = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(interval)
        resolve()
      } else if (Date.now() >= deadline) {
        clearInterval(interval)
        reject(new Error(`Timeout waiting for: ${selector}`))
      }
    }, 50)
  })
}
