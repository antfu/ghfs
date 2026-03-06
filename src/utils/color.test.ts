import { describe, expect, it, vi } from 'vitest'
import { randomHexColor } from './color'

describe('randomHexColor', () => {
  it('returns six-digit lowercase hex string', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.12345)
    expect(randomHexColor()).toMatch(/^[0-9a-f]{6}$/)
    randomSpy.mockRestore()
  })

  it('pads values with leading zeros', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(randomHexColor()).toBe('000000')
    randomSpy.mockRestore()
  })
})
