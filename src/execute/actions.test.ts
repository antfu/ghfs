import { describe, expect, it } from 'vitest'
import { ACTION_ALIASES, ACTIONS_ALIAS_MAP, ACTIONS_SUPPORTED, resolveActionName } from './actions'

describe('resolveActionName', () => {
  it('resolves canonical action names case-insensitively', () => {
    for (const action of ACTIONS_SUPPORTED) {
      expect(resolveActionName(action)).toBe(action)
      expect(resolveActionName(action.toUpperCase())).toBe(action)
    }
  })

  it('resolves aliases case-insensitively', () => {
    for (const alias of ACTION_ALIASES) {
      expect(resolveActionName(alias)).toBe(ACTIONS_ALIAS_MAP[alias])
      expect(resolveActionName(alias.toUpperCase())).toBe(ACTIONS_ALIAS_MAP[alias])
    }
  })

  it('returns undefined for unknown actions', () => {
    expect(resolveActionName('unknown')).toBeUndefined()
    expect(resolveActionName('')).toBeUndefined()
    expect(resolveActionName('   ')).toBeUndefined()
  })

  it('resolves the reject alias to request-changes', () => {
    expect(resolveActionName('reject')).toBe('request-changes')
    expect(resolveActionName('REJECT')).toBe('request-changes')
  })

  it('resolves the merge-when-ready alias to enqueue-merge', () => {
    expect(resolveActionName('merge-when-ready')).toBe('enqueue-merge')
  })
})
