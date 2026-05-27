import type { Octokit } from 'octokit'
import { describe, expect, it, vi } from 'vitest'
import { randomHexColor } from '../../utils/color'
import { createGitHubClient } from './client'
import { createGitHubProvider } from './provider'

vi.mock('./client', () => ({
  createGitHubClient: vi.fn(),
}))
vi.mock('../../utils/color', () => ({
  randomHexColor: vi.fn(() => 'abcdef'),
}))

const mockedCreateGitHubClient = vi.mocked(createGitHubClient)
const mockedRandomHexColor = vi.mocked(randomHexColor)

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
        mergeable: true,
        mergeable_state: 'clean',
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

    const graphql = vi.fn(async () => ({
      repository: {
        pullRequest: {
          reviewDecision: 'REVIEW_REQUIRED',
          latestOpinionatedReviews: { nodes: [] },
        },
      },
    }))

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
      graphql,
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
        stateReason: null,
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
        stateReason: null,
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
      mergeable: true,
      mergeableState: 'clean',
      reviewDecision: 'review_required',
    })
  })

  it('exposes repo merge settings and probes merge queue via GraphQL', async () => {
    const reposGet = vi.fn(async () => ({
      data: {
        name: 'repo',
        full_name: 'owner/repo',
        description: null,
        private: false,
        archived: false,
        default_branch: 'main',
        html_url: 'https://github.com/owner/repo',
        fork: false,
        open_issues_count: 0,
        has_issues: true,
        has_projects: true,
        has_wiki: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        pushed_at: '2026-01-01T00:00:00.000Z',
        owner: { login: 'owner' },
        allow_merge_commit: false,
        allow_squash_merge: true,
        allow_rebase_merge: true,
      },
    }))
    const graphql = vi.fn(async () => ({
      repository: { mergeQueue: { id: 'MQ_abc' } },
    }))

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        repos: { get: reposGet },
      },
      graphql,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const repository = await provider.fetchRepository()
    expect(repository.allow_merge_commit).toBe(false)
    expect(repository.allow_squash_merge).toBe(true)
    expect(repository.allow_rebase_merge).toBe(true)
    expect(repository.merge_queue_enabled).toBe(true)
    expect(graphql).toHaveBeenCalledTimes(1)
  })

  it('reports merge_queue_enabled false when GraphQL returns no merge queue', async () => {
    const reposGet = vi.fn(async () => ({
      data: {
        name: 'repo',
        full_name: 'owner/repo',
        description: null,
        private: false,
        archived: false,
        default_branch: 'main',
        html_url: 'https://github.com/owner/repo',
        fork: false,
        open_issues_count: 0,
        has_issues: true,
        has_projects: true,
        has_wiki: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        pushed_at: '2026-01-01T00:00:00.000Z',
        owner: { login: 'owner' },
      },
    }))
    const graphql = vi.fn(async () => ({ repository: { mergeQueue: null } }))

    mockedCreateGitHubClient.mockReturnValue({
      rest: { repos: { get: reposGet } },
      graphql,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const repository = await provider.fetchRepository()
    expect(repository.merge_queue_enabled).toBe(false)
  })

  it('reports merge_queue_enabled null when GraphQL probe throws', async () => {
    const reposGet = vi.fn(async () => ({
      data: {
        name: 'repo',
        full_name: 'owner/repo',
        description: null,
        private: false,
        archived: false,
        default_branch: 'main',
        html_url: 'https://github.com/owner/repo',
        fork: false,
        open_issues_count: 0,
        has_issues: true,
        has_projects: true,
        has_wiki: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        pushed_at: '2026-01-01T00:00:00.000Z',
        owner: { login: 'owner' },
      },
    }))
    const graphql = vi.fn(async () => {
      throw new Error('insufficient scope')
    })

    mockedCreateGitHubClient.mockReturnValue({
      rest: { repos: { get: reposGet } },
      graphql,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const repository = await provider.fetchRepository()
    expect(repository.merge_queue_enabled).toBeNull()
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

  it('creates missing labels before add-labels and set-labels actions', async () => {
    const listLabelsForRepo = vi.fn()
    const addLabels = vi.fn(async () => ({ data: {} }))
    const setLabels = vi.fn(async () => ({ data: {} }))
    const repositoryLabels = new Set(['bug'])
    const createLabel = vi.fn(async ({ name }: { name: string }) => {
      repositoryLabels.add(name)
      return { data: {} }
    })

    const paginate = vi.fn(async (method: unknown) => {
      if (method === listLabelsForRepo) {
        return [...repositoryLabels].map(name => ({
          name,
          color: 'ededed',
          description: null,
          default: false,
        }))
      }
      return []
    })

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        issues: {
          listLabelsForRepo,
          createLabel,
          addLabels,
          setLabels,
        },
      },
      paginate,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })
    mockedRandomHexColor.mockReset()
    mockedRandomHexColor
      .mockReturnValueOnce('123456')
      .mockReturnValueOnce('654321')

    await provider.actionAddLabels(10, ['bug', 'enhancement'])
    expect(createLabel).toHaveBeenCalledTimes(1)
    expect(createLabel).toHaveBeenNthCalledWith(1, {
      owner: 'owner',
      repo: 'repo',
      name: 'enhancement',
      color: '123456',
    })
    expect(addLabels).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 10,
      labels: ['bug', 'enhancement'],
    })

    await provider.actionSetLabels(10, ['enhancement', 'help wanted'])
    expect(createLabel).toHaveBeenCalledTimes(2)
    expect(createLabel).toHaveBeenNthCalledWith(2, {
      owner: 'owner',
      repo: 'repo',
      name: 'help wanted',
      color: '654321',
    })
    expect(setLabels).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 10,
      labels: ['enhancement', 'help wanted'],
    })
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

  it('submits PR reviews via pulls.createReview', async () => {
    const createReview = vi.fn(async () => ({ data: {} }))

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        pulls: {
          createReview,
        },
      },
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    await provider.actionApprove(42)
    expect(createReview).toHaveBeenLastCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
      event: 'APPROVE',
    })

    await provider.actionApprove(42, 'LGTM')
    expect(createReview).toHaveBeenLastCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
      event: 'APPROVE',
      body: 'LGTM',
    })

    await provider.actionRequestChanges(42, 'needs work')
    expect(createReview).toHaveBeenLastCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
      event: 'REQUEST_CHANGES',
      body: 'needs work',
    })

    await provider.actionReviewComment(42, 'just a thought')
    expect(createReview).toHaveBeenLastCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
      event: 'COMMENT',
      body: 'just a thought',
    })
  })

  it('merges PRs via pulls.merge with the requested method', async () => {
    const merge = vi.fn(async () => ({ data: {} }))

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        pulls: {
          merge,
        },
      },
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    await provider.actionMerge(7, {})
    expect(merge).toHaveBeenLastCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 7,
      merge_method: 'squash',
    })

    await provider.actionMerge(7, { method: 'rebase' })
    expect(merge).toHaveBeenLastCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 7,
      merge_method: 'rebase',
    })

    await provider.actionMerge(7, { method: 'merge', commitTitle: 'Title', commitMessage: 'Message' })
    expect(merge).toHaveBeenLastCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 7,
      merge_method: 'merge',
      commit_title: 'Title',
      commit_message: 'Message',
    })
  })

  it('enqueues PRs via the GraphQL enqueuePullRequest mutation', async () => {
    const pullsGet = vi.fn(async () => ({ data: { node_id: 'PR_node_42' } }))
    const graphql = vi.fn(async () => ({
      enqueuePullRequest: { mergeQueueEntry: { id: 'MQE_xyz' } },
    }))

    mockedCreateGitHubClient.mockReturnValue({
      rest: { pulls: { get: pullsGet } },
      graphql,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    await provider.actionEnqueueMerge(42)
    expect(pullsGet).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 42 })
    expect(graphql).toHaveBeenCalledTimes(1)
    const call = graphql.mock.calls[0] as unknown as [string, { input: { pullRequestId: string } }]
    expect(call[1]).toEqual({ input: { pullRequestId: 'PR_node_42' } })
  })

  it('derives reviewDecision from latest reviews when GraphQL returns null reviewDecision', async () => {
    const pullsGet = vi.fn(async () => ({
      data: {
        draft: false,
        merged: false,
        merged_at: null,
        base: { ref: 'main' },
        head: { ref: 'feature' },
        requested_reviewers: [],
        mergeable: true,
        mergeable_state: 'clean',
      },
    }))
    const graphql = vi.fn(async () => ({
      repository: {
        pullRequest: {
          reviewDecision: null,
          latestOpinionatedReviews: {
            nodes: [
              { state: 'APPROVED' },
              { state: 'CHANGES_REQUESTED' },
            ],
          },
        },
      },
    }))

    mockedCreateGitHubClient.mockReturnValue({
      rest: { pulls: { get: pullsGet } },
      graphql,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const meta = await provider.fetchPullMetadata(5)
    // CHANGES_REQUESTED takes precedence over APPROVED.
    expect(meta.reviewDecision).toBe('changes_requested')
  })

  it('falls back to approved when no GitHub reviewDecision and only approvals present', async () => {
    const pullsGet = vi.fn(async () => ({
      data: {
        draft: false,
        merged: false,
        merged_at: null,
        base: { ref: 'main' },
        head: { ref: 'feature' },
        requested_reviewers: [],
        mergeable: true,
        mergeable_state: 'clean',
      },
    }))
    const graphql = vi.fn(async () => ({
      repository: {
        pullRequest: {
          reviewDecision: null,
          latestOpinionatedReviews: {
            nodes: [{ state: 'APPROVED' }],
          },
        },
      },
    }))

    mockedCreateGitHubClient.mockReturnValue({
      rest: { pulls: { get: pullsGet } },
      graphql,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const meta = await provider.fetchPullMetadata(6)
    expect(meta.reviewDecision).toBe('approved')
  })

  it('returns reviewDecision null when GraphQL fails and there are no requested reviewers', async () => {
    const pullsGet = vi.fn(async () => ({
      data: {
        draft: false,
        merged: false,
        merged_at: null,
        base: { ref: 'main' },
        head: { ref: 'feature' },
        requested_reviewers: [],
        mergeable: true,
        mergeable_state: 'clean',
      },
    }))
    const graphql = vi.fn(async () => {
      throw new Error('insufficient scope')
    })

    mockedCreateGitHubClient.mockReturnValue({
      rest: { pulls: { get: pullsGet } },
      graphql,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const meta = await provider.fetchPullMetadata(7)
    expect(meta.reviewDecision).toBeNull()
  })

  it('maps inline review comments via listReviewComments', async () => {
    const listReviewComments = vi.fn()
    const paginate = vi.fn(async (method: unknown) => {
      if (method === listReviewComments) {
        return [
          {
            id: 101,
            body: 'looks fine',
            created_at: '2026-02-01T00:00:00.000Z',
            updated_at: '2026-02-01T00:00:00.000Z',
            path: 'src/foo.ts',
            line: 42,
            original_line: 40,
            start_line: 40,
            side: 'RIGHT',
            diff_hunk: '@@ -10,3 +10,3 @@\n-old\n+new',
            commit_id: 'abc123',
            pull_request_review_id: 9000,
            in_reply_to_id: null,
            user: { login: 'reviewer-1', avatar_url: 'https://example.com/a.png' },
            reactions: null,
          },
          {
            id: 102,
            body: null,
            created_at: '2026-02-01T00:01:00.000Z',
            updated_at: '2026-02-01T00:01:00.000Z',
            path: 'src/bar.ts',
            line: null,
            user: null,
            diff_hunk: '',
            pull_request_review_id: null,
            in_reply_to_id: 101,
          },
        ]
      }
      return []
    })

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        pulls: {
          listReviewComments,
        },
      },
      paginate,
    } as unknown as Octokit)

    const provider = createGitHubProvider({
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
    })

    const reviewComments = await provider.fetchReviewComments(7)
    expect(reviewComments).toEqual([
      {
        id: 101,
        body: 'looks fine',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        author: 'reviewer-1',
        authorAvatarUrl: 'https://example.com/a.png',
        path: 'src/foo.ts',
        line: 42,
        startLine: 40,
        side: 'RIGHT',
        diffHunk: '@@ -10,3 +10,3 @@\n-old\n+new',
        commitId: 'abc123',
        pullRequestReviewId: 9000,
        inReplyToId: null,
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
      {
        id: 102,
        body: null,
        createdAt: '2026-02-01T00:01:00.000Z',
        updatedAt: '2026-02-01T00:01:00.000Z',
        author: null,
        path: 'src/bar.ts',
        line: null,
        diffHunk: '',
        pullRequestReviewId: null,
        inReplyToId: 101,
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
  })
})
