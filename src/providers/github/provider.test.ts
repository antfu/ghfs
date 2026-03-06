import type { Octokit } from 'octokit'
import { describe, expect, it, vi } from 'vitest'
import { createGitHubClient } from './client'
import { createGitHubProvider } from './provider'

vi.mock('./client', () => ({
  createGitHubClient: vi.fn(),
}))

const mockedCreateGitHubClient = vi.mocked(createGitHubClient)

describe('createGitHubProvider', () => {
  it('maps GitHub items/comments and pull metadata to provider models', async () => {
    const listForRepo = vi.fn()
    const listComments = vi.fn()
    const pullsGet = vi.fn(async () => ({
      data: {
        draft: false,
        merged: false,
        merged_at: null,
        base: { ref: 'main' },
        head: { ref: 'feature' },
        requested_reviewers: [{ login: 'reviewer-1' }],
      },
    }))
    const paginate = Object.assign(
      vi.fn(async (method: unknown) => {
        if (method === listComments) {
          return [
            {
              id: 99,
              body: 'comment body',
              created_at: '2026-01-02T00:00:00.000Z',
              updated_at: '2026-01-03T00:00:00.000Z',
              user: { login: 'commenter' },
              reactions: {
                'total_count': 2,
                '+1': 1,
                '-1': 0,
                'laugh': 0,
                'hooray': 0,
                'confused': 0,
                'heart': 1,
                'rocket': 0,
                'eyes': 0,
              },
            },
          ]
        }
        return []
      }),
      {
        iterator: vi.fn(async function* () {
          yield {
            data: [
              {
                number: 1,
                state: 'open',
                html_url: 'https://github.com/owner/repo/issues/1',
                updated_at: '2026-01-10T00:00:00.000Z',
                created_at: '2026-01-01T00:00:00.000Z',
                closed_at: null,
                title: 'Issue 1',
                body: 'Body 1',
                user: { login: 'user-1' },
                labels: ['bug', { name: 'help wanted' }, { name: null }],
                assignees: [{ login: 'assignee-1' }],
                milestone: { title: 'v1' },
                reactions: {
                  'total_count': 1,
                  '+1': 1,
                  '-1': 0,
                  'laugh': 0,
                  'hooray': 0,
                  'confused': 0,
                  'heart': 0,
                  'rocket': 0,
                  'eyes': 0,
                },
              },
              {
                number: 2,
                state: 'closed',
                html_url: 'https://github.com/owner/repo/pull/2',
                updated_at: '2026-01-11T00:00:00.000Z',
                created_at: '2026-01-02T00:00:00.000Z',
                closed_at: '2026-01-12T00:00:00.000Z',
                title: 'PR 2',
                body: 'Body 2',
                user: { login: 'user-2' },
                labels: [],
                assignees: [],
                milestone: null,
                reactions: {
                  'total_count': 0,
                  '+1': 0,
                  '-1': 0,
                  'laugh': 0,
                  'hooray': 0,
                  'confused': 0,
                  'heart': 0,
                  'rocket': 0,
                  'eyes': 0,
                },
                pull_request: {},
              },
            ],
          }
        }),
      },
    )

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        issues: {
          listForRepo,
          listComments,
        },
        pulls: {
          get: pullsGet,
        },
      },
      paginate,
      request: vi.fn(),
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const items = await provider.fetchItems({ state: 'all' })
    expect(items).toEqual([
      {
        number: 1,
        kind: 'issue',
        url: 'https://github.com/owner/repo/issues/1',
        state: 'open',
        updatedAt: '2026-01-10T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        closedAt: null,
        title: 'Issue 1',
        body: 'Body 1',
        author: 'user-1',
        labels: ['bug', 'help wanted'],
        assignees: ['assignee-1'],
        milestone: 'v1',
        reactions: {
          totalCount: 1,
          plusOne: 1,
          minusOne: 0,
          laugh: 0,
          hooray: 0,
          confused: 0,
          heart: 0,
          rocket: 0,
          eyes: 0,
        },
      },
      {
        number: 2,
        kind: 'pull',
        url: 'https://github.com/owner/repo/pull/2',
        state: 'closed',
        updatedAt: '2026-01-11T00:00:00.000Z',
        createdAt: '2026-01-02T00:00:00.000Z',
        closedAt: '2026-01-12T00:00:00.000Z',
        title: 'PR 2',
        body: 'Body 2',
        author: 'user-2',
        labels: [],
        assignees: [],
        milestone: null,
        reactions: {
          totalCount: 0,
          plusOne: 0,
          minusOne: 0,
          laugh: 0,
          hooray: 0,
          confused: 0,
          heart: 0,
          rocket: 0,
          eyes: 0,
        },
      },
    ])

    const comments = await provider.fetchComments(1)
    expect(comments).toEqual([
      {
        id: 99,
        body: 'comment body',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
        author: 'commenter',
        reactions: {
          totalCount: 2,
          plusOne: 1,
          minusOne: 0,
          laugh: 0,
          hooray: 0,
          confused: 0,
          heart: 1,
          rocket: 0,
          eyes: 0,
        },
      },
    ])

    const pullMetadata = await provider.fetchPullMetadata(2)
    expect(pullMetadata).toEqual({
      isDraft: false,
      merged: false,
      mergedAt: null,
      baseRef: 'main',
      headRef: 'feature',
      requestedReviewers: ['reviewer-1'],
    })
  })

  it('supports page-level and item-level iteration helpers', async () => {
    const listForRepo = vi.fn()
    const paginate = Object.assign(
      vi.fn(async () => []),
      {
        iterator: vi.fn(async function* () {
          yield {
            data: [
              {
                number: 1,
                state: 'open',
                updated_at: '2026-01-10T00:00:00.000Z',
                created_at: '2026-01-01T00:00:00.000Z',
                closed_at: null,
                title: 'Issue 1',
                body: 'Body 1',
                user: { login: 'user-1' },
                labels: [],
                assignees: [],
                milestone: null,
              },
            ],
          }
          yield {
            data: [
              {
                number: 2,
                state: 'open',
                updated_at: '2026-01-11T00:00:00.000Z',
                created_at: '2026-01-02T00:00:00.000Z',
                closed_at: null,
                title: 'Issue 2',
                body: 'Body 2',
                user: { login: 'user-2' },
                labels: [],
                assignees: [],
                milestone: null,
              },
            ],
          }
        }),
      },
    )

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        issues: {
          listForRepo,
        },
      },
      paginate,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const pages: number[][] = []
    for await (const page of provider.paginateItems({ state: 'open' }))
      pages.push(page.map(item => item.number))

    const numbers: number[] = []
    for await (const item of provider.eachItem({ state: 'open' }))
      numbers.push(item.number)

    expect(pages).toEqual([[1], [2]])
    expect(numbers).toEqual([1, 2])
  })

  it('handles remove-label 404 and resolves milestone by title', async () => {
    const listMilestones = vi.fn()
    const removeLabel = vi
      .fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: {} })
    const update = vi.fn(async () => ({ data: {} }))

    const paginate = vi.fn(async (method: unknown) => {
      if (method === listMilestones) {
        return [
          { number: 1, title: 'v1' },
          { number: 2, title: 'v2' },
        ]
      }
      return []
    })

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        issues: {
          removeLabel,
          update,
          listMilestones,
        },
      },
      paginate,
      request: vi.fn(),
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    await provider.actionRemoveLabels(10, ['missing', 'existing'])
    expect(removeLabel).toHaveBeenCalledTimes(2)

    await provider.actionSetMilestone(10, 'v2')
    expect(update).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 10,
      milestone: 2,
    })
  })
})
