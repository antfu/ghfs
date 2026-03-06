import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countNoun,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatValue,
} from './format'

afterEach(() => {
  vi.useRealTimers()
})

describe('formatValue', () => {
  it('formats nullish values as empty strings', () => {
    expect(formatValue(undefined)).toBe('')
    expect(formatValue(null)).toBe('')
  })

  it('formats numbers and strings', () => {
    expect(formatValue(123456)).toBe(formatNumber(123456))
    expect(formatValue('ready')).toBe('ready')
  })

  it('formats date with relative time', () => {
    const now = new Date('2026-03-05T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    expect(formatValue(now)).toBe(`${now.toLocaleString()} (just now)`)
  })
})

describe('formatRelativeTime', () => {
  it('formats recent timestamps with seconds and minutes', () => {
    const now = new Date('2026-03-05T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    expect(formatRelativeTime(new Date(now.getTime() - 500))).toBe('just now')
    expect(formatRelativeTime(new Date(now.getTime() - 2000))).toBe('2s ago')
    expect(formatRelativeTime(new Date(now.getTime() - 120000))).toBe('2m ago')
  })

  it('falls back to locale string for older timestamps', () => {
    const now = new Date('2026-03-05T00:00:00.000Z')
    const older = new Date('2026-03-04T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    expect(formatRelativeTime(older)).toBe(older.toLocaleString())
  })
})

describe('countNoun', () => {
  it('uses singular and plural labels', () => {
    expect(countNoun(1, 'item')).toBe('1 item')
    expect(countNoun(2, 'item')).toBe('2 items')
    expect(countNoun(2, 'person', 'people')).toBe('2 people')
  })
})

describe('formatDuration', () => {
  it('formats milliseconds and seconds', () => {
    expect(formatDuration(999)).toBe('999ms')
    expect(formatDuration(2500)).toBe('2.50s')
  })
})
