import type { GhfsResolvedConfig } from '../types'
import { describe, expect, it } from 'vitest'
import { shouldDropUntrackedClosedItem } from './sync-repository-utils'

function sync(overrides: Partial<GhfsResolvedConfig['sync']> = {}): GhfsResolvedConfig['sync'] {
  return {
    issues: true,
    pulls: true,
    closed: overrides.closed ?? true,
    backfill: overrides.backfill ?? false,
    patches: overrides.patches ?? 'open',
  }
}

describe('shouldDropUntrackedClosedItem', () => {
  it('drops a closed item that has no local file', () => {
    expect(shouldDropUntrackedClosedItem(sync(), 'closed', false)).toBe(true)
  })

  it('keeps it when backfill is enabled', () => {
    expect(shouldDropUntrackedClosedItem(sync({ backfill: true }), 'closed', false)).toBe(false)
  })

  it('keeps a closed item that already has a local file', () => {
    expect(shouldDropUntrackedClosedItem(sync(), 'closed', true)).toBe(false)
  })

  it('never claims an open item, even without a local file', () => {
    expect(shouldDropUntrackedClosedItem(sync(), 'open', false)).toBe(false)
  })

  it('leaves closed: false to the delete-everything branch', () => {
    expect(shouldDropUntrackedClosedItem(sync({ closed: false }), 'closed', false)).toBe(false)
  })
})
