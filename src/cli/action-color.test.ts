import c from 'ansis'
import { describe, expect, it } from 'vitest'
import { colorizeAction, describeCliOperation } from './action-color'

describe('action color formatting', () => {
  it('keeps plain action when tty is disabled', () => {
    expect(colorizeAction('close', false)).toBe('close')
    expect(describeCliOperation({
      action: 'close',
      number: 123,
    }, { tty: false })).toBe('#123 close')
  })

  it('applies colors and preserves readable text', () => {
    const formatted = describeCliOperation({
      action: 'add-labels',
      number: 123,
      labels: ['pr-welcome'],
    }, { tty: true })
    expect(c.strip(formatted)).toBe('#123 add-labels pr-welcome')

    if (c.isSupported())
      expect(formatted).not.toBe('#123 add-labels pr-welcome')
  })

  it('formats operation summary with action color', () => {
    const label = describeCliOperation({
      action: 'add-labels',
      number: 123,
      labels: ['pr-welcome'],
    }, { tty: true, repo: 'owner/repo' })
    expect(stripTerminalFormatting(label)).toBe('#123 add-labels pr-welcome')
    if (c.isSupported())
      expect(label).toContain('https://github.com/owner/repo/issues/123')
  })
})

function stripTerminalFormatting(value: string): string {
  const oscPrefix = '\u001B]8;;'
  const oscSuffix = '\u001B\\'
  const oscClose = `${oscPrefix}${oscSuffix}`

  let output = ''
  let cursor = 0

  while (cursor < value.length) {
    const openIndex = value.indexOf(oscPrefix, cursor)
    if (openIndex < 0) {
      output += value.slice(cursor)
      break
    }

    output += value.slice(cursor, openIndex)
    const openSuffixIndex = value.indexOf(oscSuffix, openIndex + oscPrefix.length)
    if (openSuffixIndex < 0)
      break

    const labelStart = openSuffixIndex + oscSuffix.length
    const closeIndex = value.indexOf(oscClose, labelStart)
    if (closeIndex < 0) {
      output += value.slice(labelStart)
      break
    }

    output += value.slice(labelStart, closeIndex)
    cursor = closeIndex + oscClose.length
  }

  return c.strip(output)
}
