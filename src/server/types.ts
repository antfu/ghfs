import type { PendingOp } from '../execute/types'
import type { SyncProgressSnapshot, SyncStage, SyncSummary } from '../sync/contracts'
import type { ExecutionResult } from '../types/execution'
import type { SyncState } from '../types/sync-state'

export type QueueSource = 'execute.yml' | 'execute.md' | 'per-item'

export interface QueueEntry {
  /** Stable id derived from source+index+action+number; survives refreshes. */
  id: string
  source: QueueSource
  /** Index within its source list (ymlOps concat execute.md ops concat per-item ops). */
  index: number
  op: PendingOp
  /** Relative file path under the storage directory, for per-item entries. */
  filePath?: string
}

export interface QueueState {
  entries: QueueEntry[]
  warnings: string[]
  /** Total queued ops; drives the ↑ counter. */
  upCount: number
}

export interface RemoteStatus {
  /** Items updated on GitHub since lastSyncedAt; drives the ↓ counter. */
  downCount: number
  /** ISO timestamp of the last poll (success or failure). */
  checkedAt: string
  /** True if poll was never run, failed, or no token is available. */
  stale: boolean
  /** Optional message explaining stale state (e.g. "Missing token"). */
  message?: string
}

export interface RepoMeta {
  repo: string
  storageDir: string
  ghfsVersion: string
  lastSyncedAt?: string
  lastSince?: string
  hasToken: boolean
}

export interface InitialPayload {
  repo: RepoMeta
  syncState: SyncState
  queue: QueueState
  remote: RemoteStatus
  recentExecutions: ExecutionResult[]
}

export interface SyncTriggerOptions {
  full?: boolean
  since?: string
  numbers?: number[]
}

export interface ExecuteTriggerOptions {
  entryIds?: string[]
  continueOnError?: boolean
}

export interface SyncProgressPayload {
  stage: SyncStage
  message?: string
  snapshot: SyncProgressSnapshot
}

export interface ExecuteProgressPayload {
  completed: number
  planned: number
  applied: number
  failed: number
  detail: ExecutionResult['details'][number]
}

export interface ServerFunctions {
  getInitialPayload: () => Promise<InitialPayload>
  getSyncState: () => Promise<SyncState>
  getQueue: () => Promise<QueueState>
  getRepoMeta: () => Promise<RepoMeta>
  triggerSync: (options: SyncTriggerOptions) => Promise<SyncSummary>
  executeQueue: (options: ExecuteTriggerOptions) => Promise<ExecutionResult>
  addQueueOp: (op: PendingOp) => Promise<QueueState>
  updateQueueOp: (id: string, op: PendingOp) => Promise<QueueState>
  removeQueueOp: (id: string) => Promise<QueueState>
  clearQueue: () => Promise<QueueState>
  checkRemote: () => Promise<RemoteStatus>
  openInEditor: (filePath: string) => Promise<void>
}

export interface ClientFunctions {
  onSyncStageStart: (payload: { stage: SyncStage, message: string }) => void
  onSyncProgress: (payload: SyncProgressPayload) => void
  onSyncStageEnd: (payload: { stage: SyncStage, durationMs: number }) => void
  onSyncComplete: (summary: SyncSummary) => void
  onSyncError: (message: string) => void
  onExecuteStart: (payload: { planned: number }) => void
  onExecuteProgress: (payload: ExecuteProgressPayload) => void
  onExecuteComplete: (result: ExecutionResult) => void
  onExecuteError: (message: string) => void
  onSyncStateChange: (state: SyncState) => void
  onQueueChange: (queue: QueueState) => void
  onRemoteStatusChange: (status: RemoteStatus) => void
}
