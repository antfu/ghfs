import type { RemotePollerHandle } from '../server/poller'
import type { QueueState, RemoteStatus } from '../server/types'
import type { GhfsWatcherHandle } from '../server/watcher'
import type { SyncProgressSnapshot, SyncStage, SyncSummary } from '../sync/contracts'

import type { GhfsResolvedConfig } from '../types'
import type { ExecutionResult } from '../types/execution'
import type { RepositoryProvider } from '../types/provider'
import type { SyncState } from '../types/sync-state'

/**
 * The runtime context for ONE mirrored repository, shared by both
 * `ghfs ui` (single project) and `ghfs hub` (multiple projects).
 *
 * The shape mirrors the legacy `ServerContext` from `src/server/context.ts`
 * (kept for the watcher/poller modules) and adds `id` + `path` so the hub
 * layer can route RPC calls and broadcasts to the right project.
 */
export interface ProjectContext {
  /** Stable slug — used as the projectId in RPC calls and SPA routes. */
  id: string
  /** Absolute filesystem path to the project root. */
  path: string
  /** Display name (defaults to `id`). */
  name: string
  config: GhfsResolvedConfig
  repo: string
  storageDirAbsolute: string
  executeFilePath: string
  getToken: () => Promise<string>
  getProvider: () => Promise<RepositoryProvider | null>
  poller: RemotePollerHandle
  watcher: GhfsWatcherHandle
  /**
   * Broadcast events tagged with this project's id. Each method maps to
   * a devframe broadcast like `ghfs:onSyncStateChange` with a `{ projectId, ... }`
   * payload — the client picks the right project bucket from there.
   */
  broadcast: ProjectBroadcast
}

export interface SyncStageStartEvent { stage: SyncStage, message: string }
export interface SyncProgressEvent { stage: SyncStage, message?: string, snapshot: SyncProgressSnapshot }
export interface SyncStageEndEvent { stage: SyncStage, durationMs: number }
export interface ExecuteStartEvent { planned: number }
export interface ExecuteProgressEvent {
  completed: number
  planned: number
  applied: number
  failed: number
  detail: ExecutionResult['details'][number]
}

export interface ProjectBroadcast {
  onSyncStageStart: (event: SyncStageStartEvent) => void
  onSyncProgress: (event: SyncProgressEvent) => void
  onSyncStageEnd: (event: SyncStageEndEvent) => void
  onSyncComplete: (summary: SyncSummary) => void
  onSyncError: (message: string) => void
  onExecuteStart: (event: ExecuteStartEvent) => void
  onExecuteProgress: (event: ExecuteProgressEvent) => void
  onExecuteComplete: (result: ExecutionResult) => void
  onExecuteError: (message: string) => void
  onSyncStateChange: (state: SyncState) => void
  onQueueChange: (queue: QueueState) => void
  onRemoteStatusChange: (status: RemoteStatus) => void
}

export interface ProjectRegistry {
  /** App mode — controls hub-only RPC registration and SPA routing. */
  readonly mode: 'ui' | 'hub'
  /** Resolve a project context by id, or null if not enabled. */
  getProject: (id: string) => ProjectContext | null
  /** List all currently enabled project contexts. */
  listProjects: () => ProjectContext[]
  /** Cleanup all projects (poller + watcher). */
  close: () => Promise<void>
}
