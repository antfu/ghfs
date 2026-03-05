import type { GhfsResolvedConfig } from '../types'
import type { ProviderItem, RepositoryProvider } from '../types/provider'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
      version: 1,
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      items: {
        1: {
          number: 1,
          kind: 'issue',
          state: 'open',
          lastUpdatedAt: '2026-01-10T00:00:00.000Z',
          lastSyncedAt: '2026-01-01T00:00:00.000Z',
          filePath: 'issues/00001-issue-1.md',
        },
      },
      executions: [],
    }, null, 2), 'utf8')

    const fetchItems = vi.fn(async ({ state }: { state: string, since?: string }): Promise<ProviderItem[]> => {
      if (state === 'open') {
        return [
          {
            number: 1,
            kind: 'issue' as const,
            state: 'open' as const,
            updatedAt: '2026-01-10T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            closedAt: null,
            title: 'Issue 1',
            body: 'Body',
            author: 'user1',
            labels: [],
            assignees: [],
            milestone: null,
          },
        ]
      }
      return []
    })
    const fetchComments = vi.fn(async () => [])

    const provider = createMockProvider({
      fetchItems,
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
    expect(summary.written).toBe(0)
    expect(fetchItems).toHaveBeenCalledTimes(1)
    expect(fetchItems).toHaveBeenCalledWith({ state: 'open', since: undefined })
    expect(fetchComments).not.toHaveBeenCalled()

    const syncState = await loadSyncState(storageDir)
    expect(syncState.items['1']?.lastUpdatedAt).toBe('2026-01-10T00:00:00.000Z')
    expect(syncState.items['1']?.lastSyncedAt).toBe(summary.syncedAt)

    await rm(cwd, { recursive: true, force: true })
  })

  it('syncs only pull requests when sync.issues is disabled', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const fetchItems = vi.fn(async (): Promise<ProviderItem[]> => {
      return [
        {
          number: 1,
          kind: 'issue' as const,
          state: 'open' as const,
          updatedAt: '2026-01-10T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          closedAt: null,
          title: 'Issue 1',
          body: 'Issue body',
          author: 'issue-user',
          labels: [],
          assignees: [],
          milestone: null,
        },
        {
          number: 2,
          kind: 'pull' as const,
          state: 'open' as const,
          updatedAt: '2026-01-10T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          closedAt: null,
          title: 'PR 2',
          body: 'PR body',
          author: 'pr-user',
          labels: [],
          assignees: [],
          milestone: null,
        },
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
      fetchItems,
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
    expect(summary.written).toBe(1)
    expect(fetchPullMetadata).toHaveBeenCalledTimes(1)
    expect(fetchPullMetadata).toHaveBeenCalledWith(2)
    expect(fetchComments).toHaveBeenCalledTimes(1)
    expect(fetchComments).toHaveBeenCalledWith(2)

    await expect(stat(join(cwd, '.ghfs', 'issues', '00001-issue-1.md'))).rejects.toThrow()
    await expect(stat(join(cwd, '.ghfs', 'pulls', '00002-pr-2.md'))).resolves.toBeDefined()

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
      closed: sync.closed ?? 'existing',
      patches: sync.patches ?? 'open',
    },
  }
}
