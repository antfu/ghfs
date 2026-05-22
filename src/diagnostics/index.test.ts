import { describe, expect, it } from 'vitest'
import { diagnostics } from './index'

const sampleParams: Record<string, unknown> = {
  action: 'close',
  command: 'set-title',
  detail: 'oops',
  gitRepo: 'a/b',
  id: 'entry-1',
  issue: '#42',
  path: '.ghfs/issues/42.md',
  pkgRepo: 'a/c',
  remoteUpdatedAt: '2025-01-01T00:00:00Z',
  repo: 'a/b',
  source: 'execute.md',
  syntax: 'set-title #<n> "<t>"',
  target: '.ghfs/issues/42.md',
  value: 'x',
}

describe('diagnostics registry', () => {
  it('every registered code produces a well-formed Diagnostic', () => {
    const codes = Object.keys(diagnostics)
    expect(codes.length).toBeGreaterThan(20)

    const factory = diagnostics as unknown as Record<string, (params?: unknown) => { name: string, message: string, docs?: string }>
    for (const code of codes) {
      const d = factory[code](sampleParams)
      expect(d.name).toBe(code)
      expect(typeof d.message).toBe('string')
      expect(d.message.length).toBeGreaterThan(0)
      expect(d.docs).toBe(`https://github.com/antfu/ghfs/blob/main/docs/errors/${code.toLowerCase()}.md`)
    }
  })
})
