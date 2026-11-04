import { describe, expect, it } from 'vitest'
import { sharedTokenCount, titleTokens } from './tokens'

describe('titleTokens', () => {
  it('keeps meaningful words only', () => {
    expect([...titleTokens('Fix: the CLI crashes when `--all` is passed')]).toEqual(['cli', 'crashes', 'all', 'passed'])
  })
})

describe('sharedTokenCount', () => {
  it('counts tokens present in both sets', () => {
    expect(sharedTokenCount(titleTokens('CLI crashes on start'), titleTokens('Crashes on CLI startup'))).toBe(2)
  })
})
