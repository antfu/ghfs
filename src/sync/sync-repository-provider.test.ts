import type { RepositoryProvider } from '../types/provider'
import type { SyncContext } from './sync-repository-types'
import process from 'node:process'
import { join } from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import { fetchIssueCandidatesByNumbers, fetchIssueCandidatesByPagination } from './sync-repository-provider'

describe('sync-repository-provider', () => {
  it('uses open pagination and collects allOpenNumbers when closed sync is disabled', async () => {
    const paginateItems = vi.fn(async function* () {
      yield [
        createItem(1, 'issue'),
        createItem(2, 'pull'),
      ]
    })

    const context = createContext({
      paginateItems,
    })

    const result = await fetchIssueCandidatesByPagination(context, undefined)

    expect(paginateItems).toHaveBeenCalledWith({
      state: 'open',
      since: undefined,
    })
    expect(result.issues.map(item => item.number)).toEqual([1, 2])
    expect(result.scanned).toBe(2)
    expect([...result.allOpenNumbers ?? []]).toEqual([1, 2])
  })

  it('uses all-state pagination when closed sync is enabled', async () => {
    const paginateItems = vi.fn(async function* () {
      yield [createItem(1, 'issue')]
    })

    const context = createContext({
      paginateItems,
      closed: true,
    })

    const result = await fetchIssueCandidatesByPagination(context, '2026-01-01T00:00:00.000Z')

    expect(paginateItems).toHaveBeenCalledWith({
      state: 'all',
      since: '2026-01-01T00:00:00.000Z',
    })
    expect(result.allOpenNumbers).toBeUndefined()
    expect(result.scanned).toBe(1)
  })

  it('filters by enabled kinds during pagination', async () => {
    const paginateItems = vi.fn(async function* () {
      yield [
        createItem(1, 'issue'),
        createItem(2, 'pull'),
      ]
    })

    const context = createContext({
      paginateItems,
      issues: false,
      pulls: true,
    })

    const result = await fetchIssueCandidatesByPagination(context, undefined)

    expect(result.issues.map(item => item.number)).toEqual([2])
    expect(result.scanned).toBe(1)
  })

  it('loads specific numbers and filters by enabled kinds', async () => {
    const fetchItemsByNumbers = vi.fn(async () => [
      createItem(10, 'issue'),
      createItem(11, 'pull'),
    ])

    const context = createContext({
      fetchItemsByNumbers,
      issues: true,
      pulls: false,
    })

    const result = await fetchIssueCandidatesByNumbers(context, [10, 11])

    expect(fetchItemsByNumbers).toHaveBeenCalledWith([10, 11])
    expect(result.issues.map(item => item.number)).toEqual([10])
    expect(result.scanned).toBe(1)
    expect(result.allOpenNumbers).toBeUndefined()
  })
})

const emptyPaginateItems: RepositoryProvider['paginateItems'] = async function* emptyPaginateItems() {
  yield []
}

function createContext(overrides: {
  paginateItems?: RepositoryProvider['paginateItems']
  fetchItemsByNumbers?: RepositoryProvider['fetchItemsByNumbers']
  issues?: boolean
  pulls?: boolean
  closed?: boolean
}): SyncContext {
  return {
    provider: {
      paginateItems: overrides.paginateItems ?? emptyPaginateItems,
      fetchItems: vi.fn(async () => []),
      async* eachItem() {},
      fetchItemsByNumbers: overrides.fetchItemsByNumbers ?? vi.fn(async () => []),
      fetchComments: vi.fn(async () => []),
      fetchPullMetadata: vi.fn(async () => ({
        isDraft: false,
        merged: false,
        mergedAt: null,
        baseRef: 'main',
        headRef: 'feature',
        requestedReviewers: [],
      })),
      fetchPullPatch: vi.fn(async () => ''),
      fetchPullCommits: vi.fn(async () => []),
      fetchTimeline: vi.fn(async () => []),
      fetchItemSnapshot: vi.fn(async number => ({
        number,
        kind: 'issue',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
      fetchRepository: vi.fn(async () => ({
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
        owner: {
          login: 'owner',
        },
      })),
      fetchRepositoryLabels: vi.fn(async () => []),
      fetchRepositoryMilestones: vi.fn(async () => []),
      fetchAuthenticatedUser: vi.fn(async () => null),
      getRequestCount: vi.fn(() => 0),
      actionClose: vi.fn(async () => {}),
      actionReopen: vi.fn(async () => {}),
      actionSetTitle: vi.fn(async () => {}),
      actionSetBody: vi.fn(async () => {}),
      actionAddComment: vi.fn(async () => {}),
      actionAddLabels: vi.fn(async () => {}),
      actionRemoveLabels: vi.fn(async () => {}),
      actionSetLabels: vi.fn(async () => {}),
      actionAddAssignees: vi.fn(async () => {}),
      actionRemoveAssignees: vi.fn(async () => {}),
      actionSetAssignees: vi.fn(async () => {}),
      actionSetMilestone: vi.fn(async () => {}),
      actionClearMilestone: vi.fn(async () => {}),
      actionLock: vi.fn(async () => {}),
      actionUnlock: vi.fn(async () => {}),
      actionRequestReviewers: vi.fn(async () => {}),
      actionRemoveReviewers: vi.fn(async () => {}),
      actionMarkReadyForReview: vi.fn(async () => {}),
      actionConvertToDraft: vi.fn(async () => {}),
    } as unknown as RepositoryProvider,
    repoSlug: 'owner/repo',
    storageDirAbsolute: join(process.cwd(), '.ghfs'),
    config: {
      cwd: process.cwd(),
      repo: 'owner/repo',
      directory: '.ghfs',
      auth: {
        token: '',
      },
      sync: {
        issues: overrides.issues ?? true,
        pulls: overrides.pulls ?? true,
        closed: overrides.closed ?? false,
        patches: 'open',
      },
    },
    syncState: {
      version: 2,
      executions: [],
      items: {},
    },
    syncedAt: '2026-01-01T00:00:00.000Z',
    totalIssues: 0,
    totalPulls: 0,
  }
}

function createItem(number: number, kind: 'issue' | 'pull') {
  return {
    number,
    kind,
    state: 'open' as const,
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    closedAt: null,
    title: `${kind} ${number}`,
    body: null,
    author: 'user',
    labels: [],
    assignees: [],
    milestone: null,
  }
}
