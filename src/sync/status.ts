import type { GhfsResolvedConfig } from '../types'
import { resolve } from 'node:path'
import { loadSyncState } from './state'

export interface StatusSummary {
  repo?: string
  lastSyncedAt?: string
  totalTracked: number
  openCount: number
  closedCount: number
  executionRuns: number
  lastSyncRun?: {
    runId: string
    mode: 'full' | 'incremental' | 'targeted'
    startedAt: string
    finishedAt: string
    durationMs: number
    since?: string
    numbersCount?: number
    counters: {
      scanned: number
      selected: number
      processed: number
      skipped: number
      written: number
      moved: number
      patchesWritten: number
      patchesDeleted: number
    }
    stages: {
      resolve: number
      fetch: number
      filter: number
      sync: number
      prune: number
      save: number
    }
  }
  lastExecution?: {
    runId: string
    createdAt: string
    mode: 'dry-run' | 'apply'
    planned: number
    applied: number
    failed: number
  }
}

export async function getStatusSummary(config: GhfsResolvedConfig): Promise<StatusSummary> {
  const syncState = await loadSyncState(resolve(config.cwd, config.directory))
  const items = Object.values(syncState.items)
  const openCount = items.filter(item => item.state === 'open').length
  const closedCount = items.filter(item => item.state === 'closed').length
  const lastExecution = syncState.executions[0]
  const lastSyncRun = syncState.lastSyncRun

  return {
    repo: syncState.repo,
    lastSyncedAt: syncState.lastSyncedAt,
    totalTracked: items.length,
    openCount,
    closedCount,
    executionRuns: syncState.executions.length,
    lastSyncRun: lastSyncRun
      ? {
          runId: lastSyncRun.runId,
          mode: lastSyncRun.mode,
          startedAt: lastSyncRun.startedAt,
          finishedAt: lastSyncRun.finishedAt,
          durationMs: lastSyncRun.durationMs,
          since: lastSyncRun.since,
          numbersCount: lastSyncRun.numbersCount,
          counters: {
            scanned: lastSyncRun.counters.scanned,
            selected: lastSyncRun.counters.selected,
            processed: lastSyncRun.counters.processed,
            skipped: lastSyncRun.counters.skipped,
            written: lastSyncRun.counters.written,
            moved: lastSyncRun.counters.moved,
            patchesWritten: lastSyncRun.counters.patchesWritten,
            patchesDeleted: lastSyncRun.counters.patchesDeleted,
          },
          stages: {
            resolve: lastSyncRun.stages.resolve,
            fetch: lastSyncRun.stages.fetch,
            filter: lastSyncRun.stages.filter,
            sync: lastSyncRun.stages.sync,
            prune: lastSyncRun.stages.prune,
            save: lastSyncRun.stages.save,
          },
        }
      : undefined,
    lastExecution: lastExecution
      ? {
          runId: lastExecution.runId,
          createdAt: lastExecution.createdAt,
          mode: lastExecution.mode,
          planned: lastExecution.planned,
          applied: lastExecution.applied,
          failed: lastExecution.failed,
        }
      : undefined,
  }
}
