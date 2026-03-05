import type { Octokit } from 'octokit'
import type { GhfsResolvedConfig } from '../types'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGitHubClient } from '../github/client'
import { syncRepository } from './index'
import { getSyncStatePath, loadSyncState } from './state'

vi.mock('../github/client', () => ({
  createGitHubClient: vi.fn(),
}))

const mockedCreateGitHubClient = vi.mocked(createGitHubClient)

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

    const listForRepo = vi.fn()
    const listComments = vi.fn()
    const paginateCalls: Array<{ state: string, since?: string }> = []

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        issues: {
          listForRepo,
          listComments,
        },
      },
      paginate: vi.fn(async (method: unknown, params: { state: string, since?: string }) => {
        if (method === listForRepo) {
          paginateCalls.push({ state: params.state, since: params.since })
          return [
            {
              number: 1,
              state: 'open',
              updated_at: '2026-01-10T00:00:00.000Z',
              created_at: '2026-01-01T00:00:00.000Z',
              closed_at: null,
              title: 'Issue 1',
              body: 'Body',
              user: { login: 'user1' },
              labels: [],
              assignees: [],
              milestone: null,
            },
          ]
        }
        if (method === listComments)
          return []
        return []
      }),
      request: vi.fn(),
    } as unknown as Octokit)

    const summary = await syncRepository({
      config: createConfig(cwd, { closed: false }),
      repo: 'owner/repo',
      token: 'test-token',
      full: true,
    })

    expect(summary.scanned).toBe(1)
    expect(summary.selected).toBe(1)
    expect(summary.processed).toBe(1)
    expect(summary.skipped).toBe(1)
    expect(summary.mode).toBe('full')
    expect(summary.durationMs).toBeGreaterThanOrEqual(0)
    expect(summary.written).toBe(0)
    expect(paginateCalls).toHaveLength(1)
    expect(paginateCalls[0].state).toBe('open')
    expect(listComments).not.toHaveBeenCalled()

    const syncState = await loadSyncState(storageDir)
    expect(syncState.items['1']?.lastUpdatedAt).toBe('2026-01-10T00:00:00.000Z')
    expect(syncState.items['1']?.lastSyncedAt).toBe(summary.syncedAt)
    expect(syncState.lastSyncRun?.mode).toBe('full')
    expect(syncState.lastSyncRun?.counters.skipped).toBe(1)
    expect(syncState.lastSyncRun?.counters.processed).toBe(1)

    await rm(cwd, { recursive: true, force: true })
  })

  it('syncs only pull requests when sync.issues is disabled', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const listForRepo = vi.fn()
    const listComments = vi.fn()
    const pullsGet = vi.fn(async () => {
      return {
        data: {
          draft: false,
          merged: false,
          merged_at: null,
          base: { ref: 'main' },
          head: { ref: 'feature' },
          requested_reviewers: [],
        },
      }
    })
    const paginateCalls: Array<{ method: unknown, params: Record<string, unknown> }> = []

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
      paginate: vi.fn(async (method: unknown, params: Record<string, unknown>) => {
        paginateCalls.push({ method, params })
        if (method === listForRepo) {
          return [
            {
              number: 1,
              state: 'open',
              updated_at: '2026-01-10T00:00:00.000Z',
              created_at: '2026-01-01T00:00:00.000Z',
              closed_at: null,
              title: 'Issue 1',
              body: 'Issue body',
              user: { login: 'issue-user' },
              labels: [],
              assignees: [],
              milestone: null,
            },
            {
              number: 2,
              state: 'open',
              updated_at: '2026-01-10T00:00:00.000Z',
              created_at: '2026-01-01T00:00:00.000Z',
              closed_at: null,
              title: 'PR 2',
              body: 'PR body',
              user: { login: 'pr-user' },
              labels: [],
              assignees: [],
              milestone: null,
              pull_request: {},
            },
          ]
        }
        if (method === listComments)
          return []
        return []
      }),
      request: vi.fn(),
    } as unknown as Octokit)

    const summary = await syncRepository({
      config: createConfig(cwd, {
        issues: false,
        pulls: true,
        patches: false,
      }),
      repo: 'owner/repo',
      token: 'test-token',
      full: true,
    })

    expect(summary.scanned).toBe(2)
    expect(summary.selected).toBe(1)
    expect(summary.processed).toBe(1)
    expect(summary.skipped).toBe(0)
    expect(summary.written).toBe(1)
    expect(pullsGet).toHaveBeenCalledTimes(1)

    const commentCalls = paginateCalls.filter(call => call.method === listComments)
    expect(commentCalls).toHaveLength(1)
    expect(commentCalls[0].params.issue_number).toBe(2)

    await expect(stat(join(cwd, '.ghfs', 'issues', '00001-issue-1.md'))).rejects.toThrow()
    await expect(stat(join(cwd, '.ghfs', 'pulls', '00002-pr-2.md'))).resolves.toBeDefined()

    await rm(cwd, { recursive: true, force: true })
  })

  it('emits reporter lifecycle callbacks for sync progress', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-sync-index-test-'))
    const listForRepo = vi.fn()
    const listComments = vi.fn()

    mockedCreateGitHubClient.mockReturnValue({
      rest: {
        issues: {
          listForRepo,
          listComments,
        },
      },
      paginate: vi.fn(async (method: unknown) => {
        if (method === listForRepo) {
          return [
            {
              number: 4,
              state: 'open',
              updated_at: '2026-01-12T00:00:00.000Z',
              created_at: '2026-01-01T00:00:00.000Z',
              closed_at: null,
              title: 'Issue 4',
              body: 'Body',
              user: { login: 'user4' },
              labels: [],
              assignees: [],
              milestone: null,
            },
          ]
        }
        if (method === listComments)
          return []
        return []
      }),
      request: vi.fn(),
    } as unknown as Octokit)

    const events: string[] = []
    const summary = await syncRepository({
      config: createConfig(cwd),
      repo: 'owner/repo',
      token: 'test-token',
      full: true,
      reporter: {
        onStart: () => events.push('start'),
        onStageStart: event => events.push(`stage:start:${event.stage}`),
        onStageUpdate: (event) => {
          if (event.stage === 'sync')
            events.push(`stage:update:${event.stage}`)
        },
        onStageEnd: event => events.push(`stage:end:${event.stage}`),
        onComplete: () => events.push('complete'),
      },
    })

    expect(summary.mode).toBe('full')
    expect(summary.processed).toBe(1)
    expect(events).toContain('start')
    expect(events).toContain('stage:start:resolve')
    expect(events).toContain('stage:start:sync')
    expect(events).toContain('stage:end:save')
    expect(events).toContain('stage:update:sync')
    expect(events).toContain('complete')

    await rm(cwd, { recursive: true, force: true })
  })
})

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
