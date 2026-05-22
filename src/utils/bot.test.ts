import { describe, expect, it } from 'vitest'
import { isBotLogin } from './bot'

describe('isBotLogin', () => {
  it('returns false for null, undefined, or empty', () => {
    expect(isBotLogin(null)).toBe(false)
    expect(isBotLogin(undefined)).toBe(false)
    expect(isBotLogin('')).toBe(false)
  })

  it('detects logins ending with [bot]', () => {
    expect(isBotLogin('dependabot[bot]')).toBe(true)
    expect(isBotLogin('renovate[bot]')).toBe(true)
    expect(isBotLogin('github-actions[bot]')).toBe(true)
  })

  it('treats regular logins as humans', () => {
    expect(isBotLogin('antfu')).toBe(false)
    expect(isBotLogin('octocat')).toBe(false)
  })

  it('matches the extra list case-insensitively', () => {
    expect(isBotLogin('coderabbitai', ['CodeRabbitAI'])).toBe(true)
    expect(isBotLogin('CodeRabbitAI', ['coderabbitai'])).toBe(true)
    expect(isBotLogin('antfu', ['coderabbitai'])).toBe(false)
  })

  it('ignores the [bot] check on partial matches', () => {
    expect(isBotLogin('not-a-bot')).toBe(false)
    expect(isBotLogin('[bot]something')).toBe(false)
  })
})
