import type { GhfsResolvedConfig, SyncItemState } from '../types'
import type { ProviderItem, RepositoryProvider } from '../types/provider'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GHFS_VERSION } from '../meta'
import { syncRepository } from './index'
import { getSyncStatePath, loadSyncState } from './state'

describe('syncRepository', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses open-only pagination when closed sync is disabled and skips unchanged items', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const storageDir = join(cwd, '.ghfs')
    await mkdir(join(storageDir, 'issues'), { recursive: true })
    await writeFile(join(storageDir, 'issues', '00001-issue-1.md'), '# existing\n', 'utf8')
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 2,
      repo: 'owner/repo',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      lastRepoUpdatedAt: '2026-01-02T00:00:00.000Z',
      items: {
        1: createTrackedItem({
          number: 1,
          kind: 'issue',
          state: 'open',
          updatedAt: '2026-01-10T00:00:00.000Z',
          filePath: 'issues/00001-issue-1.md',
        }),
      },
      executions: [],
    }, null, 2), 'utf8')

    const paginateItems = vi.fn(async function* ({ state }: { state: string }) {
      if (state === 'open') {
        yield [createIssue({
          number: 1,
          kind: 'issue',
          state: 'open',
          updatedAt: '2026-01-10T00:00:00.000Z',
          title: 'Issue 1',
        })]
      }
      else {
        yield []
      }
    })
    const fetchComments = vi.fn(async () => [])
    const provider = createMockProvider({
      paginateItems,
      fetchComments,
    })

    const summary = await syncRepository({
      config: createConfig(cwd, { closed: false }),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      full: true,
    })

    expect(summary.scanned).toBe(1)
    expect(summary.selected).toBe(1)
    expect(summary.processed).toBe(1)
    expect(summary.skipped).toBe(1)
    expect(summary.updatedIssues).toBe(0)
    expect(summary.updatedPulls).toBe(0)
    expect(summary.durationMs).toBeGreaterThanOrEqual(0)
    expect(summary.written).toBe(0)
    expect(fetchComments).not.toHaveBeenCalled()

    const syncState = await loadSyncState(storageDir)
    expect(syncState.items['1']?.lastUpdatedAt).toBe('2026-01-10T00:00:00.000Z')
    expect(syncState.items['1']?.lastSyncedAt).toBe(summary.syncedAt)
    expect(syncState.lastSyncRun?.counters.skipped).toBe(1)
    expect(syncState.lastSyncRun?.counters.processed).toBe(1)

    await expect(stat(join(storageDir, 'issues.md'))).resolves.toBeDefined()
    await expect(stat(join(storageDir, 'pulls.md'))).resolves.toBeDefined()
    await expect(stat(join(storageDir, 'repo.json'))).resolves.toBeDefined()

    await rm(cwd, { recursive: true, force: true })
  })

  it('regenerates markdown from sync state on ghfs version mismatch', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const storageDir = join(cwd, '.ghfs')
    const tracked = createTrackedItem({
      number: 1,
      kind: 'issue',
      state: 'open',
      updatedAt: '2026-01-10T00:00:00.000Z',
      filePath: 'issues/00001-issue-1.md',
    })
    tracked.data.item.reactions = {
      totalCount: 3,
      plusOne: 2,
      minusOne: 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 1,
      rocket: 0,
      eyes: 0,
    }
    tracked.data.comments = [
      {
        id: 10,
        body: 'Looks good',
        createdAt: '2026-01-01T03:00:00.000Z',
        updatedAt: '2026-01-01T03:00:00.000Z',
        author: 'alice',
        reactions: {
          totalCount: 1,
          plusOne: 0,
          minusOne: 0,
          laugh: 1,
          hooray: 0,
          confused: 0,
          heart: 0,
          rocket: 0,
          eyes: 0,
        },
      },
    ]

    await mkdir(join(storageDir, 'issues'), { recursive: true })
    await writeFile(join(storageDir, 'issues', '00001-issue-1.md'), '# stale\n', 'utf8')
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 2,
      ghfsVersion: '0.0.0',
      repo: 'owner/repo',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      lastRepoUpdatedAt: '2026-01-02T00:00:00.000Z',
      items: {
        1: tracked,
      },
      executions: [],
    }, null, 2), 'utf8')

    const paginateItems = vi.fn(async function* () {
      yield []
    })
    const provider = createMockProvider({
      paginateItems,
    })

    const summary = await syncRepository({
      config: createConfig(cwd),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
    })

    expect(summary.scanned).toBe(0)
    expect(summary.written).toBe(0)
    expect(paginateItems).not.toHaveBeenCalled()
    const markdown = await readFile(join(storageDir, 'issues', '00001-issue-1.md'), 'utf8')
    expect(markdown).toContain('> `👍 2` | `❤️ 1`')
    expect(markdown).toContain('> `😄 1`')

    const syncState = await loadSyncState(storageDir)
    expect(syncState.ghfsVersion).toBe(GHFS_VERSION)

    await rm(cwd, { recursive: true, force: true })
  })

  it('syncs only pull requests when sync.issues is disabled', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const paginateItems = vi.fn(async function* () {
      yield [
        createIssue({
          number: 1,
          kind: 'issue',
          state: 'open',
          updatedAt: '2026-01-10T00:00:00.000Z',
          title: 'Issue 1',
        }),
        createIssue({
          number: 2,
          kind: 'pull',
          state: 'open',
          updatedAt: '2026-01-10T00:00:00.000Z',
          title: 'PR 2',
        }),
      ]
    })

    const fetchComments = vi.fn(async () => [])
    const fetchPullMetadata = vi.fn(async () => {
      return {
        isDraft: false,
        merged: false,
        mergedAt: null,
        baseRef: 'main',
        headRef: 'feature',
        requestedReviewers: [],
      }
    })

    const provider = createMockProvider({
      paginateItems,
      fetchComments,
      fetchPullMetadata,
    })

    const summary = await syncRepository({
      config: createConfig(cwd, {
        issues: false,
        pulls: true,
        patches: false,
      }),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      full: true,
    })

    expect(summary.scanned).toBe(1)
    expect(summary.selected).toBe(1)
    expect(summary.processed).toBe(1)
    expect(summary.skipped).toBe(0)
    expect(summary.written).toBe(1)
    expect(summary.updatedIssues).toBe(0)
    expect(summary.updatedPulls).toBe(1)
    expect(fetchPullMetadata).toHaveBeenCalledTimes(1)
    expect(fetchPullMetadata).toHaveBeenCalledWith(2)
    expect(fetchComments).toHaveBeenCalledTimes(1)
    expect(fetchComments).toHaveBeenCalledWith(2)

    await expect(stat(join(cwd, '.ghfs', 'issues', '00001-issue-1.md'))).rejects.toThrow()
    await expect(stat(join(cwd, '.ghfs', 'pulls', '00002-pr-2.md'))).resolves.toBeDefined()
    await expect(stat(join(cwd, '.ghfs', 'issues.md'))).resolves.toBeDefined()
    await expect(stat(join(cwd, '.ghfs', 'pulls.md'))).resolves.toBeDefined()
    await expect(stat(join(cwd, '.ghfs', 'repo.json'))).resolves.toBeDefined()

    await rm(cwd, { recursive: true, force: true })
  })

  it('renames local markdown when title changes without tracked state', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const storageDir = join(cwd, '.ghfs')
    await mkdir(join(storageDir, 'issues'), { recursive: true })
    await writeFile(join(storageDir, 'issues', '00001-old-title.md'), '# stale title\n', 'utf8')

    const paginateItems = vi.fn(async function* () {
      yield [createIssue({
        number: 1,
        kind: 'issue',
        state: 'open',
        updatedAt: '2026-01-15T00:00:00.000Z',
        title: 'New Title',
      })]
    })
    const fetchComments = vi.fn(async () => [])
    const provider = createMockProvider({
      paginateItems,
      fetchComments,
    })

    const summary = await syncRepository({
      config: createConfig(cwd),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      full: true,
    })

    expect(summary.processed).toBe(1)
    expect(summary.written).toBe(1)

    const renamedPath = join(storageDir, 'issues', '00001-new-title.md')
    await expect(stat(renamedPath)).resolves.toBeDefined()
    await expect(stat(join(storageDir, 'issues', '00001-old-title.md'))).rejects.toThrow()
    await expect(readFile(renamedPath, 'utf8')).resolves.toContain('# New Title')

    await rm(cwd, { recursive: true, force: true })
  })

  it('reconciles markdown files by scan after sync', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const storageDir = join(cwd, '.ghfs')
    const trackedRenamed = createTrackedItem({
      number: 1,
      kind: 'issue',
      state: 'open',
      updatedAt: '2026-01-10T00:00:00.000Z',
      filePath: 'issues/00001-old-title.md',
    })
    trackedRenamed.data.item.title = 'Renamed Issue'

    const trackedMissing = createTrackedItem({
      number: 2,
      kind: 'issue',
      state: 'open',
      updatedAt: '2026-01-11T00:00:00.000Z',
      filePath: 'issues/00002-issue-2.md',
    })

    await mkdir(join(storageDir, 'issues'), { recursive: true })
    await writeFile(join(storageDir, 'issues', '00001-old-title.md'), '# stale title\n', 'utf8')
    await writeFile(join(storageDir, 'issues', '00099-extra.md'), '# extra item\n', 'utf8')
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 2,
      ghfsVersion: GHFS_VERSION,
      repo: 'owner/repo',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      lastRepoUpdatedAt: '2026-01-02T00:00:00.000Z',
      items: {
        1: trackedRenamed,
        2: trackedMissing,
      },
      executions: [],
    }, null, 2), 'utf8')

    const paginateItems = vi.fn(async function* () {
      yield []
    })
    const provider = createMockProvider({ paginateItems })

    const summary = await syncRepository({
      config: createConfig(cwd),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
    })

    expect(paginateItems).not.toHaveBeenCalled()
    expect(summary.written).toBe(1)
    expect(summary.moved).toBe(2)
    await expect(stat(join(storageDir, 'issues', '00001-renamed-issue.md'))).resolves.toBeDefined()
    await expect(stat(join(storageDir, 'issues', '00002-issue-2.md'))).resolves.toBeDefined()
    await expect(stat(join(storageDir, 'issues', '00099-extra.md'))).rejects.toThrow()
    await expect(stat(join(storageDir, 'issues', 'closed', '00099-extra.md'))).resolves.toBeDefined()

    const syncState = await loadSyncState(storageDir)
    expect(syncState.items['1']?.filePath).toBe('issues/00001-renamed-issue.md')
    expect(syncState.items['2']?.filePath).toBe('issues/00002-issue-2.md')

    await rm(cwd, { recursive: true, force: true })
  })

  it('emits reporter lifecycle callbacks for sync progress', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const paginateItems = vi.fn(async function* () {
      yield [createIssue({
        number: 4,
        kind: 'issue',
        state: 'open',
        updatedAt: '2026-01-12T00:00:00.000Z',
        title: 'Issue 4',
      })]
    })
    const fetchComments = vi.fn(async () => [])
    const provider = createMockProvider({
      paginateItems,
      fetchComments,
    })

    const events: string[] = []
    const summary = await syncRepository({
      config: createConfig(cwd),
      repo: 'owner/repo',
      token: 'test-token',
      provider,
      full: true,
      reporter: {
        onStart: () => events.push('start'),
        onStageStart: event => events.push(`stage:start:${event.stage}`),
        onStageUpdate: (event) => {
          if (event.stage === 'fetch')
            events.push(`stage:update:${event.stage}`)
        },
        onStageEnd: event => events.push(`stage:end:${event.stage}`),
        onComplete: () => events.push('complete'),
      },
    })

    expect(summary.processed).toBe(1)
    expect(events).toContain('start')
    expect(events).toContain('stage:start:metadata')
    expect(events).toContain('stage:start:pagination')
    expect(events).toContain('stage:start:fetch')
    expect(events).toContain('stage:end:save')
    expect(events).toContain('stage:update:fetch')
    expect(events).toContain('complete')

    await rm(cwd, { recursive: true, force: true })
  })
})

function createMockProvider(overrides: Partial<RepositoryProvider> = {}): RepositoryProvider {
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
    fetchItemSnapshot: vi.fn(async number => ({
      number,
      kind: 'issue' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
    fetchRepository: vi.fn(async () => createRepositoryMetadata()),
    fetchRepositoryLabels: vi.fn(async () => []),
    fetchRepositoryMilestones: vi.fn(async () => []),
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

function createConfig(cwd: string, sync: Partial<GhfsResolvedConfig['sync']> = {}): GhfsResolvedConfig {
  return {
    cwd,
    repo: 'owner/repo',
    directory: '.ghfs',
    auth: {
      token: '',
    },
    sync: {
      issues: sync.issues ?? true,
      pulls: sync.pulls ?? true,
      closed: sync.closed ?? false,
      patches: sync.patches ?? 'open',
    },
  }
}

function createRepositoryMetadata() {
  return {
    name: 'repo',
    full_name: 'owner/repo',
    description: null,
    private: false,
    archived: false,
    default_branch: 'main',
    html_url: 'https://github.com/owner/repo',
    fork: false,
    open_issues_count: 1,
    has_issues: true,
    has_projects: true,
    has_wiki: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    pushed_at: '2026-01-03T00:00:00.000Z',
    owner: {
      login: 'owner',
    },
  }
}

function createIssue(input: {
  number: number
  kind: 'issue' | 'pull'
  state: 'open' | 'closed'
  updatedAt: string
  title: string
}): ProviderItem {
  return {
    number: input.number,
    kind: input.kind,
    state: input.state,
    updatedAt: input.updatedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    closedAt: input.state === 'closed' ? input.updatedAt : null,
    title: input.title,
    body: `${input.title} body`,
    author: 'user',
    labels: [],
    assignees: [],
    milestone: null,
  }
}

function createTrackedItem(input: {
  number: number
  kind: 'issue' | 'pull'
  state: 'open' | 'closed'
  updatedAt: string
  filePath: string
}): SyncItemState {
  return {
    number: input.number,
    kind: input.kind,
    state: input.state,
    lastUpdatedAt: input.updatedAt,
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
    filePath: input.filePath,
    data: {
      item: createIssue({
        number: input.number,
        kind: input.kind,
        state: input.state,
        updatedAt: input.updatedAt,
        title: `Issue ${input.number}`,
      }),
      comments: [] as SyncItemState['data']['comments'],
      ...(input.kind === 'pull'
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
