import { describe, it, expect, beforeEach } from 'vitest'
import { domGetText, domGetHTML, domClick, domFill, domSubmit, domWaitFor } from './dom'

describe('domGetText', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="main"><p class="content">Hello world</p></div>'
  })

  it('returns full body text when no selector', () => {
    expect(domGetText({})).toContain('Hello world')
  })

  it('returns text for selector', () => {
    expect(domGetText({ selector: '.content' })).toBe('Hello world')
  })

  it('throws when selector not found', () => {
    expect(() => domGetText({ selector: '#missing' })).toThrow('Element not found')
  })
})

describe('domGetHTML', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="box"><span>Hi</span></div>'
  })

  it('returns innerHTML of matched element', () => {
    expect(domGetHTML({ selector: '#box' })).toBe('<span>Hi</span>')
  })
})

describe('domClick', () => {
  it('clicks the element', () => {
    let clicked = false
    document.body.innerHTML = '<button id="btn">Click</button>'
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true })
    domClick({ selector: '#btn' })
    expect(clicked).toBe(true)
  })
})

describe('domFill', () => {
  it('fills input value and fires input event', () => {
    document.body.innerHTML = '<input id="name" type="text" />'
    const input = document.getElementById('name') as HTMLInputElement
    let fired = false
    input.addEventListener('input', () => { fired = true })
    domFill({ selector: '#name', value: 'Alice' })
    expect(input.value).toBe('Alice')
    expect(fired).toBe(true)
  })
})

describe('domSubmit', () => {
  it('submits form', () => {
    document.body.innerHTML = '<form id="f"><input name="q" /></form>'
    let submitted = false
    document.getElementById('f')!.addEventListener('submit', (e) => {
      e.preventDefault()
      submitted = true
    })
    domSubmit({ selector: '#f' })
    expect(submitted).toBe(true)
  })
})

describe('domWaitFor', () => {
  it('resolves when element exists immediately', async () => {
    document.body.innerHTML = '<div id="ready"></div>'
    await expect(domWaitFor({ selector: '#ready', timeout: 100 })).resolves.toBeUndefined()
  })

  it('rejects when element does not appear within timeout', async () => {
    document.body.innerHTML = ''
    await expect(domWaitFor({ selector: '#missing', timeout: 50 })).rejects.toThrow('Timeout')
  })
})
