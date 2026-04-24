import type { GhfsResolvedConfig, SyncState } from '../types'
import type { ProviderLabel, ProviderMilestone, ProviderRepository, RepositoryProvider } from '../types/provider'
import type { SyncContext } from './sync-repository-types'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeRepositoryIndexes, writeRepoSnapshot } from './sync-repository-snapshot'

describe('snapshot writers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes issues.md and pulls.md tables from tracked mirrored items', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-snapshot-test-'))
    const storageDir = join(cwd, '.ghfs')
    const syncState: SyncState = {
      version: 2,
      items: {
        8: createTrackedState(8, 'issue', 'open', '2026-01-30T00:00:00.000Z', 'issues/00008-issue-8.md'),
        9: createTrackedState(9, 'issue', 'closed', '2026-01-31T00:00:00.000Z', 'issues/closed/00009-issue-9.md', ['bug']),
        10: createTrackedState(10, 'issue', 'open', '2026-02-01T00:00:00.000Z', 'issues/00010-issue-10.md', ['enhancement']),
        2: createTrackedState(2, 'pull', 'closed', '2026-02-01T05:00:00.000Z', 'pulls/closed/00002-pr-2.md', ['release']),
        3: createTrackedState(3, 'pull', 'open', '2026-02-02T00:00:00.000Z', 'pulls/00003-pr-3.md', ['review']),
      },
      executions: [],
    }

    const context = createContext(storageDir, syncState)
    await writeRepositoryIndexes(context)

    const issuesIndex = await readFile(join(storageDir, 'issues.md'), 'utf8')
    const pullsIndex = await readFile(join(storageDir, 'pulls.md'), 'utf8')

    expect(issuesIndex).toContain('# Issues')
    expect(issuesIndex).toContain('## Open (2)')
    expect(issuesIndex).toContain('## Closed (1)')
    expect(issuesIndex).toContain('`enhancement`')
    expect(issuesIndex).toContain('| #8 | Issue 8 | - | 2026-01-30T00:00:00.000Z | [issues/00008-issue-8.md](issues/00008-issue-8.md) |')
    expect(issuesIndex.indexOf('| #10 |')).toBeLessThan(issuesIndex.indexOf('| #8 |'))
    expect(issuesIndex.indexOf('## Open (2)')).toBeLessThan(issuesIndex.indexOf('## Closed (1)'))

    expect(pullsIndex).toContain('# Pull Requests')
    expect(pullsIndex).toContain('## Open (1)')
    expect(pullsIndex).toContain('## Closed (1)')
    expect(pullsIndex).toContain('| #3 | Pull 3 | `review` | 2026-02-02T00:00:00.000Z | [pulls/00003-pr-3.md](pulls/00003-pr-3.md) |')

    await rm(cwd, { recursive: true, force: true })
  })

  it('uses canonical sync state data even when markdown file is missing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-snapshot-test-'))
    const storageDir = join(cwd, '.ghfs')
    const syncState: SyncState = {
      version: 2,
      items: {
        1: createTrackedState(1, 'issue', 'open', '2026-01-03T00:00:00.000Z', 'issues/00001-broken-title.md'),
      },
      executions: [],
    }

    const context = createContext(storageDir, syncState)
    await writeRepositoryIndexes(context)

    const issuesIndex = await readFile(join(storageDir, 'issues.md'), 'utf8')
    expect(issuesIndex).toContain('| #1 | Issue 1 | - | 2026-01-03T00:00:00.000Z | [issues/00001-broken-title.md](issues/00001-broken-title.md) |')

    await rm(cwd, { recursive: true, force: true })
  })

  it('writes curated repo.json with sorted labels and all milestones', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-snapshot-test-'))
    const storageDir = join(cwd, '.ghfs')
    const syncState: SyncState = {
      version: 2,
      items: {},
      executions: [],
    }

    const context = createContext(storageDir, syncState, {
      labels: [
        { name: 'zeta', color: 'ffffff', description: null, default: false },
        { name: 'alpha', color: '000000', description: 'first', default: true },
      ],
      milestones: [
        milestone(2, 'v2', 'closed'),
        milestone(1, 'v1', 'open'),
      ],
    })

    await writeRepoSnapshot(context)

    const repoSnapshot = JSON.parse(await readFile(join(storageDir, 'repo.json'), 'utf8')) as {
      repo: string
      synced_at: string
      labels: Array<{ name: string }>
      milestones: Array<{ number: number, state: 'open' | 'closed' }>
      repository: { owner: string, full_name: string }
    }

    expect(repoSnapshot.repo).toBe('owner/repo')
    expect(repoSnapshot.synced_at).toBe('2026-02-10T00:00:00.000Z')
    expect(repoSnapshot.repository.owner).toBe('owner')
    expect(repoSnapshot.repository.full_name).toBe('owner/repo')
    expect(repoSnapshot.labels.map(label => label.name)).toEqual(['alpha', 'zeta'])
    expect(repoSnapshot.milestones.map(milestone => milestone.number)).toEqual([1, 2])
    expect(repoSnapshot.milestones.map(milestone => milestone.state)).toEqual(['open', 'closed'])

    await rm(cwd, { recursive: true, force: true })
  })
})

function createTrackedState(
  number: number,
  kind: 'issue' | 'pull',
  state: 'open' | 'closed',
  updatedAt: string,
  filePath: string,
  labels: string[] = [],
): SyncState['items'][string] {
  const title = kind === 'issue' ? `Issue ${number}` : `Pull ${number}`
  return {
    number,
    kind,
    state,
    lastUpdatedAt: updatedAt,
    lastSyncedAt: updatedAt,
    filePath,
    data: {
      item: {
        number,
        kind,
        state,
        updatedAt,
        createdAt: '2026-01-01T00:00:00.000Z',
        closedAt: state === 'closed' ? updatedAt : null,
        title,
        body: `${title} body`,
        author: 'user',
        labels,
        assignees: [],
        milestone: null,
      },
      comments: [],
      ...(kind === 'pull'
        ? {
            pull: {
              isDraft: false,
              merged: false,
              mergedAt: null,
              baseRef: 'main',
              headRef: 'feature',
              requestedReviewers: [],
            },
          }
        : {}),
    },
  }
}

function createContext(
  storageDirAbsolute: string,
  syncState: SyncState,
  options: {
    labels?: ProviderLabel[]
    milestones?: ProviderMilestone[]
    repository?: Partial<ProviderRepository>
  } = {},
): SyncContext {
  const repository: ProviderRepository = {
    name: 'repo',
    full_name: 'owner/repo',
    description: 'Test repository',
    private: false,
    archived: false,
    default_branch: 'main',
    html_url: 'https://github.com/owner/repo',
    fork: false,
    open_issues_count: 2,
    has_issues: true,
    has_projects: true,
    has_wiki: false,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    pushed_at: '2026-01-02T00:00:00.000Z',
    owner: {
      login: 'owner',
    },
    ...options.repository,
  }
  const config: GhfsResolvedConfig = {
    cwd: storageDirAbsolute,
    repo: 'owner/repo',
    directory: '.ghfs',
    auth: {
      token: '',
    },
    sync: {
      issues: true,
      pulls: true,
      closed: false,
      patches: 'open',
    },
  }

  return {
    provider: createProviderMock({
      fetchRepository: vi.fn(async () => repository),
      fetchRepositoryLabels: vi.fn(async () => options.labels ?? []),
      fetchRepositoryMilestones: vi.fn(async () => options.milestones ?? []),
      fetchAuthenticatedUser: vi.fn(async () => null),
    }),
    repoSlug: 'owner/repo',
    storageDirAbsolute,
    config,
    syncState,
    syncedAt: '2026-02-10T00:00:00.000Z',
    totalIssues: 0,
    totalPulls: 0,
  }
}

function createProviderMock(overrides: Partial<RepositoryProvider> = {}): RepositoryProvider {
  return {
    async* paginateItems() {
      yield []
    },
    fetchItems: vi.fn(async () => []),
    async* eachItem() {
    },
    fetchItemsByNumbers: vi.fn(async () => []),
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
      kind: 'issue' as const,
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
    countUpdatedSince: vi.fn(async () => ({ issues: 0, pulls: 0 })),
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
    ...overrides,
  }
}

function milestone(number: number, title: string, state: 'open' | 'closed'): ProviderMilestone {
  return {
    number,
    title,
    state,
    description: null,
    due_on: null,
    open_issues: state === 'open' ? 2 : 0,
    closed_issues: state === 'closed' ? 2 : 0,
    created_at: `2026-01-${String(number).padStart(2, '0')}T00:00:00.000Z`,
    updated_at: `2026-01-${String(number).padStart(2, '0')}T01:00:00.000Z`,
    closed_at: state === 'closed' ? `2026-02-${String(number).padStart(2, '0')}T00:00:00.000Z` : null,
  }
}
