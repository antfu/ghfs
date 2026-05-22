import type { Octokit } from 'octokit'
import { describe, expect, it, vi } from 'vitest'
import { createGitHubClient } from './client'
import { createGitHubProvider } from './provider'

vi.mock('./client', () => ({ createGitHubClient: vi.fn() }))
vi.mock('../../utils/color', () => ({ randomHexColor: vi.fn(() => 'abcdef') }))

const mockedCreateGitHubClient = vi.mocked(createGitHubClient)

function mockProviderWithTimelineEvents(events: unknown[]) {
  const listEventsForTimeline = vi.fn()
  const paginate = vi.fn(async (method: unknown) => {
    if (method === listEventsForTimeline)
      return events
    return []
  })
  mockedCreateGitHubClient.mockReturnValue({
    rest: {
      issues: { listEventsForTimeline },
    },
    paginate,
    request: vi.fn(),
  } as unknown as Octokit)

  return createGitHubProvider({ token: 't', owner: 'owner', repo: 'repo' })
}

describe('mapTimelineEvent (via fetchTimeline)', () => {
  it('maps a committed event with commit url', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        event: 'committed',
        sha: 'abc123def456',
        message: 'fix: thing\n\nmore detail',
        author: { name: 'octocat', date: '2026-01-01T00:00:00Z' },
        committer: { name: 'octocat', date: '2026-01-01T00:00:00Z' },
        html_url: 'https://github.com/owner/repo/commit/abc123def456',
      },
    ])
    const timeline = await provider.fetchTimeline(1)
    expect(timeline).toEqual([
      {
        id: 'commit:abc123def456',
        kind: 'committed',
        createdAt: '2026-01-01T00:00:00Z',
        actor: 'octocat',
        sha: 'abc123def456',
        commitMessage: 'fix: thing',
        body: 'fix: thing\n\nmore detail',
      },
    ])
  })

  it('captures source for connected events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 1,
        event: 'connected',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'octocat' },
        source: {
          type: 'issue',
          issue: {
            number: 42,
            title: 'Related issue',
            html_url: 'https://github.com/owner/repo/issues/42',
          },
        },
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toEqual({
      id: '1',
      kind: 'connected',
      createdAt: '2026-02-01T00:00:00Z',
      actor: 'octocat',
      source: {
        number: 42,
        kind: 'issue',
        title: 'Related issue',
        url: 'https://github.com/owner/repo/issues/42',
      },
    })
  })

  it('captures source for marked_as_duplicate events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 2,
        event: 'marked_as_duplicate',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        source: {
          issue: {
            number: 7,
            html_url: 'https://github.com/owner/repo/issues/7',
            pull_request: {},
          },
        },
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({
      kind: 'marked_as_duplicate',
      source: { number: 7, kind: 'pull', url: 'https://github.com/owner/repo/issues/7' },
    })
  })

  it('captures fromRepo for transferred events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 3,
        event: 'transferred',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        transferred: { from_repository: { full_name: 'old-owner/old-repo' } },
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({ kind: 'transferred', fromRepo: 'old-owner/old-repo' })
  })

  it('captures old/new refs for base_ref_changed events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 4,
        event: 'base_ref_changed',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        changes: { base: { ref: { from: 'main', to: 'next' } } },
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({ kind: 'base_ref_changed', oldRef: 'main', newRef: 'next' })
  })

  it('captures dismissed_review for review_dismissed events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 5,
        event: 'review_dismissed',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        dismissed_review: { state: 'approved', review_id: 999, dismissal_message: 'rebased' },
        review: { user: { login: 'reviewer' } },
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({
      kind: 'review_dismissed',
      dismissedReview: { state: 'approved', reviewId: 999, dismissalMessage: 'rebased' },
      reviewedBy: 'reviewer',
    })
  })

  it('captures lock_reason for locked events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 6,
        event: 'locked',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        lock_reason: 'too heated',
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({ kind: 'locked', lockReason: 'too heated' })
  })

  it('captures sha/commitUrl for merged events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 7,
        event: 'merged',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        commit_id: 'deadbeefcafe',
        commit_url: 'https://api.github.com/repos/owner/repo/commits/deadbeefcafe',
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({
      kind: 'merged',
      sha: 'deadbeefcafe',
      commitUrl: 'https://api.github.com/repos/owner/repo/commits/deadbeefcafe',
    })
  })

  it('captures commit metadata for auto_merge_enabled events', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 8,
        event: 'auto_merge_enabled',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        commit_title: 'feat: new thing',
        commit_message: 'big description',
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({
      kind: 'auto_merge_enabled',
      commitTitle: 'feat: new thing',
      commitMessage: 'big description',
    })
  })

  it('flags requested_team as isTeam for review_requested', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 9,
        event: 'review_requested',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'maintainer' },
        requested_team: { name: 'core-team' },
      },
    ])
    const [event] = await provider.fetchTimeline(1)
    expect(event).toMatchObject({
      kind: 'review_requested',
      requestedReviewer: 'core-team',
      isTeam: true,
    })
  })

  it('surfaces unknown events with rawKind instead of dropping them', async () => {
    const provider = mockProviderWithTimelineEvents([
      {
        id: 10,
        event: 'deployed',
        created_at: '2026-02-01T00:00:00Z',
        actor: { login: 'octocat' },
      },
      {
        // Even unknown events without an actor must surface now.
        id: 11,
        event: 'automatic_base_change_failed',
        created_at: '2026-02-02T00:00:00Z',
      },
    ])
    const timeline = await provider.fetchTimeline(1)
    expect(timeline).toEqual([
      { id: '10', kind: 'unknown', createdAt: '2026-02-01T00:00:00Z', actor: 'octocat', rawKind: 'deployed' },
      { id: '11', kind: 'unknown', createdAt: '2026-02-02T00:00:00Z', actor: null, rawKind: 'automatic_base_change_failed' },
    ])
  })
})
