import { describe, expect, it } from 'vitest'
import * as utils from './index'

describe('utils index', () => {
  it('re-exports utility functions', () => {
    expect(typeof utils.countNoun).toBe('function')
    expect(typeof utils.pathExists).toBe('function')
    expect(typeof utils.splitRepo).toBe('function')
    expect(typeof utils.slugifyTitle).toBe('function')
    expect(typeof utils.resolveSince).toBe('function')
  })
})
