import { describe, it, expect, vi } from 'vitest'
import { pageScroll } from './page'

describe('pageScroll', () => {
  it('calls window.scrollBy with given coordinates', () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    pageScroll({ x: 0, y: 300 })
    expect(spy).toHaveBeenCalledWith(0, 300)
  })
})
