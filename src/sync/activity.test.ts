import type { SyncItemCanonicalData, SyncState } from '../types/sync-state'
import { describe, expect, it } from 'vitest'
import { activityBucketIndex, computeItemActivityBuckets, computeProjectActivityBuckets, isCreatedToday } from './activity'

const NOW = Date.UTC(2026, 4, 21) // 2026-05-21
const MS_PER_DAY = 24 * 60 * 60 * 1000

function makeState(items: SyncState['items']): SyncState {
  return { version: 2, items, executions: [] }
}

function isoDaysAgo(days: number, baseMs = NOW): string {
  return new Date(baseMs - days * MS_PER_DAY).toISOString()
}

describe('computeProjectActivityBuckets', () => {
  it('returns zero-filled buckets when the state is empty', () => {
    const result = computeProjectActivityBuckets(makeState({}), 90, NOW)
    expect(result.buckets).toHaveLength(90)
    expect(result.total).toBe(0)
    expect(result.buckets.every(v => v === 0)).toBe(true)
  })

  it('tallies item timestamps, comments, timeline events, commits, merges', () => {
    const state = makeState({
      1: {
        number: 1,
        kind: 'pull',
        state: 'closed',
        lastUpdatedAt: isoDaysAgo(1),
        lastSyncedAt: isoDaysAgo(0),
        filePath: 'pulls/00001-foo.md',
        data: {
          item: {
            number: 1,
            kind: 'pull',
            state: 'closed',
            updatedAt: isoDaysAgo(1),
            createdAt: isoDaysAgo(10),
            closedAt: isoDaysAgo(2),
            title: 'foo',
            body: null,
            author: 'antfu',
            labels: [],
            assignees: [],
            milestone: null,
          },
          comments: [{ id: 1, body: 'hi', createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(5), author: 'a' }],
          timeline: [{ id: 't1', kind: 'reopened', createdAt: isoDaysAgo(3), actor: 'b' }],
          commits: [{ sha: 'x', message: 'm', authorLogin: 'a', authorName: 'A', authorDate: isoDaysAgo(8), committerLogin: 'a', committerDate: isoDaysAgo(7) }],
          pull: { isDraft: false, merged: true, mergedAt: isoDaysAgo(2), baseRef: 'main', headRef: 'feat', requestedReviewers: [] },
        },
      },
    })
    const result = computeProjectActivityBuckets(state, 30, NOW)
    // created + updated + closed (item) + 1 comment + 1 timeline + 1 commit (committerDate) + merged
    expect(result.total).toBe(7)
    // Buckets are oldest-first; last entry is today (0 days ago).
    expect(result.buckets[30 - 1 - 0]).toBe(0) // today
    expect(result.buckets[30 - 1 - 1]).toBe(1) // 1d ago → updatedAt
    expect(result.buckets[30 - 1 - 2]).toBe(2) // closedAt + mergedAt
    expect(result.buckets[30 - 1 - 3]).toBe(1) // timeline event
    expect(result.buckets[30 - 1 - 5]).toBe(1) // comment
    expect(result.buckets[30 - 1 - 7]).toBe(1) // committerDate
    expect(result.buckets[30 - 1 - 10]).toBe(1) // item.createdAt
  })

  it('isCreatedToday matches the UTC day of `now`', () => {
    expect(isCreatedToday(isoDaysAgo(0), NOW)).toBe(true)
    expect(isCreatedToday(isoDaysAgo(1), NOW)).toBe(false)
    expect(isCreatedToday(null, NOW)).toBe(false)
    expect(isCreatedToday(undefined, NOW)).toBe(false)
    expect(isCreatedToday('not-a-date', NOW)).toBe(false)
    // 23:59:59 UTC of `now`'s day still counts as today.
    expect(isCreatedToday(new Date(NOW + MS_PER_DAY - 1).toISOString(), NOW)).toBe(true)
    // 00:00:00 UTC of the next day no longer counts.
    expect(isCreatedToday(new Date(NOW + MS_PER_DAY).toISOString(), NOW)).toBe(false)
  })

  it('ignores timestamps outside the window', () => {
    const state = makeState({
      1: {
        number: 1,
        kind: 'issue',
        state: 'open',
        lastUpdatedAt: isoDaysAgo(120),
        lastSyncedAt: isoDaysAgo(120),
        filePath: 'issues/00001-old.md',
        data: {
          item: {
            number: 1,
            kind: 'issue',
            state: 'open',
            updatedAt: isoDaysAgo(120),
            createdAt: isoDaysAgo(200),
            closedAt: null,
            title: 'old',
            body: null,
            author: 'a',
            labels: [],
            assignees: [],
            milestone: null,
          },
          comments: [],
        },
      },
    })
    const result = computeProjectActivityBuckets(state, 90, NOW)
    expect(result.total).toBe(0)
  })
})

describe('computeItemActivityBuckets', () => {
  function makeData(overrides: Partial<SyncItemCanonicalData> = {}): SyncItemCanonicalData {
    return {
      item: {
        number: 1,
        kind: 'issue',
        state: 'open',
        // Far outside any reasonable window so makeData() defaults to "no
        // dated events" for tests that don't override the item.
        updatedAt: isoDaysAgo(10_000),
        createdAt: isoDaysAgo(10_000),
        closedAt: null,
        title: 't',
        body: null,
        author: 'a',
        labels: [],
        assignees: [],
        milestone: null,
      },
      comments: [],
      ...overrides,
    }
  }

  it('returns zero-filled buckets when no events fall in the window', () => {
    const result = computeItemActivityBuckets(makeData(), 30, NOW)
    expect(result.buckets).toHaveLength(30)
    expect(result.total).toBe(0)
    expect(result.buckets.every(v => v === 0)).toBe(true)
  })

  it('places a comment in the correct bucket (oldest-first, today is last)', () => {
    const data = makeData({
      comments: [{ id: 1, body: 'hi', createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(5), author: 'a' }],
    })
    const result = computeItemActivityBuckets(data, 30, NOW)
    expect(result.total).toBe(1)
    expect(result.buckets[30 - 1 - 5]).toBe(1)
  })

  it('ignores timestamps outside the window', () => {
    const data = makeData({
      item: {
        number: 1,
        kind: 'issue',
        state: 'open',
        updatedAt: isoDaysAgo(120),
        createdAt: isoDaysAgo(200),
        closedAt: null,
        title: 'old',
        body: null,
        author: 'a',
        labels: [],
        assignees: [],
        milestone: null,
      },
    })
    const result = computeItemActivityBuckets(data, 30, NOW)
    expect(result.total).toBe(0)
    expect(result.buckets.every(v => v === 0)).toBe(true)
  })

  it('tallies every event kind into the right buckets', () => {
    const data = makeData({
      item: {
        number: 1,
        kind: 'pull',
        state: 'closed',
        updatedAt: isoDaysAgo(1),
        createdAt: isoDaysAgo(10),
        closedAt: isoDaysAgo(2),
        title: 'foo',
        body: null,
        author: 'a',
        labels: [],
        assignees: [],
        milestone: null,
      },
      comments: [{ id: 1, body: 'hi', createdAt: isoDaysAgo(5), updatedAt: isoDaysAgo(5), author: 'a' }],
      timeline: [{ id: 't1', kind: 'reopened', createdAt: isoDaysAgo(3), actor: 'b' }],
      commits: [{ sha: 'x', message: 'm', authorLogin: 'a', authorName: 'A', authorDate: isoDaysAgo(8), committerLogin: 'a', committerDate: isoDaysAgo(7) }],
      pull: { isDraft: false, merged: true, mergedAt: isoDaysAgo(2), baseRef: 'main', headRef: 'feat', requestedReviewers: [] },
    })
    const result = computeItemActivityBuckets(data, 30, NOW)
    expect(result.total).toBe(7)
    expect(result.buckets[30 - 1 - 1]).toBe(1)
    expect(result.buckets[30 - 1 - 2]).toBe(2) // closedAt + mergedAt
    expect(result.buckets[30 - 1 - 3]).toBe(1)
    expect(result.buckets[30 - 1 - 5]).toBe(1)
    expect(result.buckets[30 - 1 - 7]).toBe(1)
    expect(result.buckets[30 - 1 - 10]).toBe(1)
  })
})

describe('activityBucketIndex', () => {
  it('returns undefined for missing or unparseable input', () => {
    expect(activityBucketIndex(null, 180, NOW)).toBeUndefined()
    expect(activityBucketIndex(undefined, 180, NOW)).toBeUndefined()
    expect(activityBucketIndex('not-a-date', 180, NOW)).toBeUndefined()
  })

  it('returns undefined for timestamps older than the window', () => {
    expect(activityBucketIndex(isoDaysAgo(200), 180, NOW)).toBeUndefined()
    expect(activityBucketIndex(isoDaysAgo(180), 180, NOW)).toBeUndefined()
  })

  it('returns days-1 for today and clamps future timestamps to days-1', () => {
    expect(activityBucketIndex(isoDaysAgo(0), 180, NOW)).toBe(179)
    expect(activityBucketIndex(isoDaysAgo(-3), 180, NOW)).toBe(179)
  })

  it('places a timestamp 30 days ago at the matching index (oldest-first)', () => {
    expect(activityBucketIndex(isoDaysAgo(30), 180, NOW)).toBe(180 - 1 - 30)
  })

  it('places a timestamp at the left edge (days-1 ago) at index 0', () => {
    expect(activityBucketIndex(isoDaysAgo(179), 180, NOW)).toBe(0)
  })
})
