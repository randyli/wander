import { describe, it, expect, vi } from 'vitest'
import { navBack, navForward } from './nav'

describe('navBack', () => {
  it('calls history.back', () => {
    const spy = vi.spyOn(history, 'back').mockImplementation(() => {})
    navBack()
    expect(spy).toHaveBeenCalled()
  })
})

describe('navForward', () => {
  it('calls history.forward', () => {
    const spy = vi.spyOn(history, 'forward').mockImplementation(() => {})
    navForward()
    expect(spy).toHaveBeenCalled()
  })
})
