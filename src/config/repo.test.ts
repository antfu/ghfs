import { describe, expect, it } from 'vitest'
import { normalizeRepo } from './repo'

describe('normalizeRepo', () => {
  it('parses owner/name', () => {
    expect(normalizeRepo('antfu/ghfs')).toBe('antfu/ghfs')
  })

  it('parses github prefix', () => {
    expect(normalizeRepo('github:antfu/ghfs')).toBe('antfu/ghfs')
  })

  it('parses ssh scp remote', () => {
    expect(normalizeRepo('git@github.com:antfu/ghfs.git')).toBe('antfu/ghfs')
  })

  it('parses ssh url remote', () => {
    expect(normalizeRepo('ssh://git@github.com/antfu/ghfs.git')).toBe('antfu/ghfs')
  })

  it('parses https remote', () => {
    expect(normalizeRepo('https://github.com/antfu/ghfs.git')).toBe('antfu/ghfs')
  })

  it('returns undefined for non-github hosts', () => {
    expect(normalizeRepo('https://gitlab.com/antfu/ghfs')).toBeUndefined()
  })

  it('returns undefined for empty input', () => {
    expect(normalizeRepo('')).toBeUndefined()
  })
})
