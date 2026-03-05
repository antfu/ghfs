import type { SyncOptions } from '../sync/contracts'
import type { SyncState } from '../types'
import { describe, expect, it } from 'vitest'
import { normalizeIssueNumbers, resolveSince } from './sync'

describe('resolveSince', () => {
  const syncState = {
    lastSyncedAt: '2026-02-01T00:00:00.000Z',
  } as SyncState

  it('returns undefined for full sync mode', () => {
    expect(resolveSince({ full: true } as SyncOptions, syncState)).toBeUndefined()
  })

  it('prefers explicit since option', () => {
    expect(resolveSince({ since: '2026-01-01T00:00:00.000Z' } as SyncOptions, syncState)).toBe('2026-01-01T00:00:00.000Z')
  })

  it('falls back to last synced timestamp', () => {
    expect(resolveSince({} as SyncOptions, syncState)).toBe('2026-02-01T00:00:00.000Z')
  })
})

describe('normalizeIssueNumbers', () => {
  it('filters invalid numbers and removes duplicates', () => {
    expect(normalizeIssueNumbers([3, 0, 3, 2, -1, 1.2, Number.NaN])).toEqual([3, 2])
  })

  it('returns undefined when numbers are not provided', () => {
    expect(normalizeIssueNumbers(undefined)).toBeUndefined()
  })
})
