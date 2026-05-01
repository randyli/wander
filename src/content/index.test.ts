import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleToolCall } from './index'

describe('handleToolCall', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="para">Test content</p>'
  })

  it('routes dom.getText to domGetText', async () => {
    const result = await handleToolCall('dom.getText', { selector: '#para' })
    expect(result).toBe('Test content')
  })

  it('routes dom.click and returns undefined', async () => {
    document.body.innerHTML = '<button id="btn">Click me</button>'
    let clicked = false
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true })
    await handleToolCall('dom.click', { selector: '#btn' })
    expect(clicked).toBe(true)
  })

  it('throws on unknown tool', async () => {
    await expect(handleToolCall('unknown.tool', {})).rejects.toThrow('Unknown tool')
  })
})
