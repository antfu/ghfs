import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSyncStatePath, loadSyncState, saveSyncState } from './state'

describe('loadSyncState', () => {
  it('normalizes legacy updatedAt to lastUpdatedAt and lastSyncedAt', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 1,
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      items: {
        123: {
          number: 123,
          kind: 'issue',
          state: 'open',
          updatedAt: '2026-01-03T00:00:00.000Z',
          filePath: 'issues/00123-legacy-issue.md',
        },
      },
      executions: [],
    }, null, 2), 'utf8')

    const state = await loadSyncState(storageDir)
    expect(state.items['123']).toMatchObject({
      number: 123,
      kind: 'issue',
      state: 'open',
      lastUpdatedAt: '2026-01-03T00:00:00.000Z',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      filePath: 'issues/00123-legacy-issue.md',
    })

    await rm(storageDir, { recursive: true, force: true })
  })

  it('keeps backward compatibility when lastSyncRun is missing', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    await writeFile(getSyncStatePath(storageDir), JSON.stringify({
      version: 1,
      items: {},
      executions: [],
    }, null, 2), 'utf8')

    const state = await loadSyncState(storageDir)
    expect(state.lastSyncRun).toBeUndefined()

    await rm(storageDir, { recursive: true, force: true })
  })

  it('loads and saves lastSyncRun telemetry', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'ghfs-sync-state-test-'))
    const expected = {
      runId: 'sync_abc',
      repo: 'owner/repo',
      mode: 'incremental' as const,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:10.000Z',
      durationMs: 10000,
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
        resolve: 2,
        fetch: 3,
        filter: 1,
        sync: 4,
        prune: 2,
        save: 1,
      },
    }

    await saveSyncState(storageDir, {
      version: 1,
      items: {},
      executions: [],
      lastSyncRun: expected,
    })

    const state = await loadSyncState(storageDir)
    expect(state.lastSyncRun).toEqual(expected)

    await rm(storageDir, { recursive: true, force: true })
  })
})
