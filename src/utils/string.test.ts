import { describe, expect, it } from 'vitest'
import { slugifyTitle } from './string'

describe('slugifyTitle', () => {
  it('normalizes mixed text into a safe slug', () => {
    expect(slugifyTitle('PR: Fix bug #12')).toBe('pr-fix-bug-12')
  })

  it('falls back to item when normalized slug is empty', () => {
    expect(slugifyTitle('---')).toBe('item')
  })

  it('applies max length and trims trailing dashes', () => {
    expect(slugifyTitle('This title has dash', 11)).toBe('this-title')
  })
})
