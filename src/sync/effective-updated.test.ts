import type { SyncItemState } from '../types/sync-state'
import { describe, expect, it } from 'vitest'
import { getEffectiveUpdatedAt } from './effective-updated'

function makeEntry(partial: Partial<SyncItemState['data']> & { item: SyncItemState['data']['item'] }): SyncItemState {
  return {
    number: partial.item.number,
    kind: partial.item.kind,
    state: partial.item.state,
    lastUpdatedAt: partial.item.updatedAt,
    lastSyncedAt: partial.item.updatedAt,
    filePath: 'issues/00001-x.md',
    data: {
      item: partial.item,
      comments: partial.comments ?? [],
      timeline: partial.timeline,
      commits: partial.commits,
      pull: partial.pull,
    },
  }
}

const baseItem: SyncItemState['data']['item'] = {
  number: 1,
  kind: 'issue',
  state: 'open',
  updatedAt: '2026-05-20T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  closedAt: null,
  title: 't',
  body: null,
  author: 'antfu',
  labels: [],
  assignees: [],
  milestone: null,
}

describe('getEffectiveUpdatedAt', () => {
  it('falls back to item.updatedAt when there are no activities', () => {
    const entry = makeEntry({ item: baseItem })
    expect(getEffectiveUpdatedAt(entry)).toBe(baseItem.updatedAt)
  })

  it('picks the latest human comment timestamp', () => {
    const entry = makeEntry({
      item: baseItem,
      comments: [
        { id: 1, body: 'a', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-02T00:00:00Z', author: 'antfu' },
        { id: 2, body: 'b', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', author: 'octocat' },
      ],
    })
    expect(getEffectiveUpdatedAt(entry)).toBe('2026-04-01T00:00:00Z')
  })

  it('skips comments authored by bots and falls back to item.updatedAt when all activity is bot-only', () => {
    const entry = makeEntry({
      item: baseItem,
      comments: [
        { id: 1, body: 'a', createdAt: '2026-05-18T00:00:00Z', updatedAt: '2026-05-18T00:00:00Z', author: 'dependabot[bot]' },
        { id: 2, body: 'b', createdAt: '2026-05-19T00:00:00Z', updatedAt: '2026-05-19T00:00:00Z', author: 'renovate[bot]' },
      ],
    })
    expect(getEffectiveUpdatedAt(entry)).toBe(baseItem.updatedAt)
  })

  it('honors the extraBots list (case-insensitive)', () => {
    const entry = makeEntry({
      item: baseItem,
      comments: [
        { id: 1, body: 'a', createdAt: '2026-05-19T00:00:00Z', updatedAt: '2026-05-19T00:00:00Z', author: 'CodeRabbitAI' },
      ],
    })
    expect(getEffectiveUpdatedAt(entry, ['coderabbitai'])).toBe(baseItem.updatedAt)
    expect(getEffectiveUpdatedAt(entry, [])).toBe('2026-05-19T00:00:00Z')
  })

  it('picks the latest timestamp across mixed comment, timeline, and commit activity', () => {
    const entry = makeEntry({
      item: baseItem,
      comments: [
        { id: 1, body: 'a', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', author: 'antfu' },
      ],
      timeline: [
        { id: 't1', kind: 'labeled', createdAt: '2026-04-15T00:00:00Z', actor: 'octocat' },
        { id: 't2', kind: 'labeled', createdAt: '2026-05-10T00:00:00Z', actor: 'github-actions[bot]' },
      ],
      commits: [
        { sha: 'a', message: 'm', authorLogin: 'antfu', authorName: 'A', authorDate: '2026-04-20T00:00:00Z', committerLogin: 'antfu', committerDate: '2026-04-20T00:00:00Z' },
        { sha: 'b', message: 'm', authorLogin: 'dependabot[bot]', authorName: 'D', authorDate: '2026-05-18T00:00:00Z', committerLogin: 'dependabot[bot]', committerDate: '2026-05-18T00:00:00Z' },
      ],
    })
    expect(getEffectiveUpdatedAt(entry)).toBe('2026-04-20T00:00:00Z')
  })
})
