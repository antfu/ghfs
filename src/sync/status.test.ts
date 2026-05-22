import type { GhfsResolvedConfig } from '../types'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'
import { getStatusSummary } from './status'

describe('getStatusSummary', () => {
  it('projects last sync run telemetry when available', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ghfs-status-test-'))
    const storageDir = join(cwd, '.ghfs')
    await mkdir(storageDir, { recursive: true })
    await writeFile(join(storageDir, '.sync.json'), JSON.stringify({
      version: 2,
      repo: 'owner/repo',
      lastSyncedAt: '2026-01-10T00:00:00.000Z',
      items: {
        1: {
          number: 1,
          kind: 'issue',
          state: 'open',
          lastUpdatedAt: '2026-01-10T00:00:00.000Z',
          lastSyncedAt: '2026-01-10T00:00:00.000Z',
          filePath: 'issues/00001-issue-1.md',
          data: {
            item: {
              number: 1,
              kind: 'issue',
              state: 'open',
              updatedAt: '2026-01-10T00:00:00.000Z',
              createdAt: '2026-01-01T00:00:00.000Z',
              closedAt: null,
              title: 'Issue 1',
              body: 'Body',
              author: 'user',
              labels: [],
              assignees: [],
              milestone: null,
            },
            comments: [],
          },
        },
      },
      executions: [],
      lastSyncRun: {
        runId: 'sync_123',
        repo: 'owner/repo',
        startedAt: '2026-01-10T00:00:00.000Z',
        finishedAt: '2026-01-10T00:00:01.000Z',
        durationMs: 1000,
        requestCount: 10,
        since: '2026-01-09T00:00:00.000Z',
        counters: {
          scanned: 1,
          selected: 1,
          processed: 1,
          skipped: 0,
          written: 1,
          moved: 0,
          patchesWritten: 0,
          patchesDeleted: 0,
        },
        stages: {
          metadata: 5,
          pagination: 10,
          fetch: 10,
          materialize: 50,
          prune: 2,
          save: 5,
        },
      },
    }, null, 2), 'utf8')

    const summary = await getStatusSummary(createConfig(cwd))
    expect(summary.repo).toBe('owner/repo')
    expect(summary.totalTracked).toBe(1)
    expect(summary.lastSyncRun?.runId).toBe('sync_123')
    expect(summary.lastSyncRun?.requestCount).toBe(10)
    expect(summary.lastSyncRun?.counters.processed).toBe(1)
    expect(summary.lastSyncRun?.stages.materialize).toBe(50)

    await rm(cwd, { recursive: true, force: true })
  })
})

function createConfig(cwd: string): GhfsResolvedConfig {
  return {
    cwd,
    repo: 'owner/repo',
    directory: '.ghfs',
    bots: [],
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
}
