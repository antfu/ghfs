import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'
import { GHFS_VERSION } from '../meta'
import { getSyncStatePath, loadSyncState, saveSyncState } from './state'

describe('loadSyncState', () => {
  it('resets state when schema version is unsupported', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 1,
      items: {
        123: {
          number: 123,
          kind: 'issue',
          state: 'open',
          lastUpdatedAt: '2026-01-03T00:00:00.000Z',
          lastSyncedAt: '2026-01-01T00:00:00.000Z',
          filePath: 'issues/00123-legacy-issue.md',
        },
      },
      executions: [],
    }, null, 2), 'utf8')

    const state = await loadSyncState(storageDir)
    expect(state).toEqual({
      version: 2,
      items: {},
      executions: [],
    })

    await rm(storageDir, { recursive: true, force: true })
  })

  it('loads v2 state when telemetry is missing', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 2,
      items: {},
      executions: [],
    }, null, 2), 'utf8')

    const state = await loadSyncState(storageDir)
    expect(state.lastSyncRun).toBeUndefined()

    await rm(storageDir, { recursive: true, force: true })
  })

  it('normalizes legacy execution mode dry-run to report', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 2,
      items: {},
      executions: [
        {
          runId: 'run_1',
          createdAt: '2026-01-01T00:00:00.000Z',
          mode: 'dry-run',
          repo: 'owner/repo',
          planned: 1,
          applied: 0,
          failed: 0,
          details: [],
        },
      ],
    }, null, 2), 'utf8')

    const state = await loadSyncState(storageDir)
    expect(state.executions[0]?.mode).toBe('report')

    await rm(storageDir, { recursive: true, force: true })
  })

  it('loads and saves lastSyncRun telemetry', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    const expected = {
      runId: 'sync_abc',
      repo: 'owner/repo',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:10.000Z',
      durationMs: 10000,
      requestCount: 12,
      since: '2026-01-01T00:00:00.000Z',
      numbersCount: 2,
      counters: {
        scanned: 3,
        selected: 2,
        processed: 2,
        skipped: 1,
        written: 1,
        moved: 0,
        patchesWritten: 0,
        patchesDeleted: 0,
      },
      stages: {
        metadata: 2,
        pagination: 3,
        fetch: 3,
        materialize: 4,
        prune: 2,
        save: 1,
      },
    }

    await saveSyncState(storageDir, {
      version: 2,
      items: {},
      executions: [],
      lastSyncRun: expected,
    })

    const state = await loadSyncState(storageDir)
    expect(state.lastSyncRun).toEqual(expected)

    await rm(storageDir, { recursive: true, force: true })
  })

  it('normalizes missing reactions and persists ghfsVersion', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 2,
      items: {
        1: {
          number: 1,
          kind: 'issue',
          state: 'open',
          lastUpdatedAt: '2026-01-03T00:00:00.000Z',
          lastSyncedAt: '2026-01-01T00:00:00.000Z',
          filePath: 'issues/00001-issue-1.md',
          data: {
            item: {
              number: 1,
              kind: 'issue',
              state: 'open',
              updatedAt: '2026-01-03T00:00:00.000Z',
              createdAt: '2026-01-01T00:00:00.000Z',
              closedAt: null,
              title: 'Issue 1',
              body: 'Body 1',
              author: 'user-1',
              labels: [],
              assignees: [],
              milestone: null,
            },
            comments: [
              {
                id: 11,
                body: 'Comment',
                createdAt: '2026-01-02T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
                author: 'user-2',
              },
            ],
          },
        },
      },
      executions: [],
    }, null, 2), 'utf8')

    const state = await loadSyncState(storageDir)
    expect(state.items['1']?.data.item.reactions?.totalCount).toBe(0)
    expect(state.items['1']?.data.comments[0]?.reactions?.totalCount).toBe(0)

    await saveSyncState(storageDir, state)
    const raw = JSON.parse(await readFile(getSyncStatePath(storageDir), 'utf8'))
    expect(raw.ghfsVersion).toBe(GHFS_VERSION)

    await rm(storageDir, { recursive: true, force: true })
  })
})
