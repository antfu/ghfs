import type { ExecutionResult } from './execution'
import type { IssueKind, IssueState } from './issue'
import type { ProviderComment, ProviderItem, ProviderPullMetadata } from './provider'

export type SyncRunStage = 'metadata' | 'pagination' | 'fetch' | 'materialize' | 'prune' | 'save'

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
  startedAt: string
  finishedAt: string
  durationMs: number
  requestCount: number
  since?: string
  numbersCount?: number
  counters: SyncRunCounters
  stages: Record<SyncRunStage, number>
}

export interface SyncItemCanonicalData {
  item: ProviderItem
  comments: ProviderComment[]
  pull?: ProviderPullMetadata
}

export interface SyncItemState {
  number: number
  kind: IssueKind
  state: IssueState
  lastUpdatedAt: string
  lastSyncedAt: string
  filePath: string
  patchPath?: string
  data: SyncItemCanonicalData
}

export interface SyncState {
  version: 2
  ghfsVersion?: string
  repo?: string
  lastSyncedAt?: string
  lastSince?: string
  lastRepoUpdatedAt?: string
  lastSyncRun?: SyncRunTelemetry
  items: Record<string, SyncItemState>
  executions: ExecutionResult[]
}
