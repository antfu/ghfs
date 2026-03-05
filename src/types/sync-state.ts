import type { ExecutionResult } from './execution'
import type { IssueKind, IssueState } from './issue'

export type SyncRunMode = 'full' | 'incremental' | 'targeted'
export type SyncRunStage = 'resolve' | 'fetch' | 'filter' | 'sync' | 'prune' | 'save'

export interface SyncRunCounters {
  scanned: number
  selected: number
  processed: number
  skipped: number
  written: number
  moved: number
  patchesWritten: number
  patchesDeleted: number
}

export interface SyncRunTelemetry {
  runId: string
  repo: string
  mode: SyncRunMode
  startedAt: string
  finishedAt: string
  durationMs: number
  since?: string
  numbersCount?: number
  counters: SyncRunCounters
  stages: Record<SyncRunStage, number>
}

export interface SyncItemState {
  number: number
  kind: IssueKind
  state: IssueState
  lastUpdatedAt: string
  lastSyncedAt: string
  filePath: string
  patchPath?: string
}

export interface SyncState {
  version: 1
  repo?: string
  lastSyncedAt?: string
  lastSince?: string
  lastSyncRun?: SyncRunTelemetry
  items: Record<string, SyncItemState>
  executions: ExecutionResult[]
}
