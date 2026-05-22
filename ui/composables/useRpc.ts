import type { ProjectInitialPayload, ProjectSummary } from '#ghfs/shared-rpc'
import type { ExecuteTriggerOptions, QueueState, RemoteStatus, RepoMeta, SyncTriggerOptions, UiState } from '#ghfs/server-types'
import type { PendingOp } from '#ghfs/execute-types'
import type { ExecutionResult } from '#ghfs/execution-types'
import type { SyncProgressSnapshot, SyncStage, SyncSummary } from '#ghfs/sync-contracts'
import type { SyncState } from '#ghfs/sync-state'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'

export interface GhfsCapabilities {
  mode: 'ui' | 'hub'
  ghfsVersion: string
  projects: ProjectSummary[]
}

export interface HubScannedProject {
  path: string
  name: string
  enabled: boolean
  iconDataUrl: string | null
}

export interface ProjectEventPayload<T> {
  projectId: string
  state?: never
}

interface GhfsClientFunctions {
  'ghfs:onSyncStageStart': (event: { projectId: string, stage: SyncStage, message: string }) => void
  'ghfs:onSyncProgress': (event: { projectId: string, stage: SyncStage, message?: string, snapshot: SyncProgressSnapshot }) => void
  'ghfs:onSyncStageEnd': (event: { projectId: string, stage: SyncStage, durationMs: number }) => void
  'ghfs:onSyncComplete': (event: { projectId: string, summary: SyncSummary }) => void
  'ghfs:onSyncError': (event: { projectId: string, message: string }) => void
  'ghfs:onExecuteStart': (event: { projectId: string, planned: number }) => void
  'ghfs:onExecuteProgress': (event: { projectId: string, completed: number, planned: number, applied: number, failed: number, detail: ExecutionResult['details'][number] }) => void
  'ghfs:onExecuteComplete': (event: { projectId: string, result: ExecutionResult }) => void
  'ghfs:onExecuteError': (event: { projectId: string, message: string }) => void
  'ghfs:onSyncStateChange': (event: { projectId: string, state: SyncState }) => void
  'ghfs:onQueueChange': (event: { projectId: string, queue: QueueState }) => void
  'ghfs:onRemoteStatusChange': (event: { projectId: string, status: RemoteStatus }) => void
  'ghfs:onProjectsChange': () => void
  'ghfs:onHubInfoChange': (event: HubInfo) => void
}

export interface HubInfo {
  roots: string[]
  launchCwd: string
  launchCwdInRoots: boolean
}

interface GhfsServerFunctions extends Record<string, (...args: unknown[]) => unknown> {
  'ghfs:capabilities': () => Promise<GhfsCapabilities>
  'ghfs:list-projects': () => Promise<ProjectSummary[]>
  'ghfs:initial-payload': (projectId: string) => Promise<ProjectInitialPayload>
  'ghfs:sync-state': (projectId: string) => Promise<SyncState>
  'ghfs:queue-state': (projectId: string) => Promise<QueueState>
  'ghfs:repo-meta': (projectId: string) => Promise<RepoMeta>
  'ghfs:trigger-sync': (projectId: string, options: SyncTriggerOptions) => Promise<SyncSummary>
  'ghfs:execute-queue': (projectId: string, options: ExecuteTriggerOptions) => Promise<ExecutionResult>
  'ghfs:add-queue-op': (projectId: string, op: PendingOp) => Promise<QueueState>
  'ghfs:update-queue-op': (projectId: string, id: string, op: PendingOp) => Promise<QueueState>
  'ghfs:remove-queue-op': (projectId: string, id: string) => Promise<QueueState>
  'ghfs:clear-queue': (projectId: string) => Promise<QueueState>
  'ghfs:check-remote': (projectId: string) => Promise<RemoteStatus>
  'ghfs:open-in-editor': (projectId: string, filePath: string) => Promise<void>
  'ghfs:save-ui-state': (projectId: string, state: UiState) => Promise<void>
  'ghfs:get-pull-patch': (projectId: string, number: number) => Promise<string | null>
  'ghfs:get-project-icon': (projectId: string) => Promise<string | null>
  'ghfs:project-activity': (projectId: string, days?: number) => Promise<ActivityResult>
  'ghfs:hub-activity': (days?: number) => Promise<ActivityResult>
  'ghfs:hub-info': () => Promise<HubInfo>
  'ghfs:hub-scan': () => Promise<HubScannedProject[]>
  'ghfs:hub-enable': (path: string) => Promise<{ id: string }>
  'ghfs:hub-disable': (id: string) => Promise<{ removed: boolean }>
  'ghfs:hub-add-root': (path: string) => Promise<HubInfo>
  'ghfs:hub-remove-root': (path: string) => Promise<HubInfo>
  'ghfs:hub-recent-items': (limit?: number) => Promise<HubRecentItem[]>
  'ghfs:hub-queue': () => Promise<HubQueueGroup[]>
  'ghfs:hub-execute-queue': (options: { projectId?: string }) => Promise<ExecutionResult[]>
  'ghfs:hub-settings': () => Promise<HubSettings>
  'ghfs:hub-set-settings': (patch: Partial<HubSettings>) => Promise<HubSettings>
}

export interface ActivityResult {
  buckets: number[]
  total: number
  days: number
}

export interface HubRecentItem {
  projectId: string
  repo: string
  kind: 'issue' | 'pull'
  number: number
  title: string
  state: 'open' | 'closed'
  updatedAt: string
  author: string | null
  labels: string[]
}

export interface HubQueueGroup {
  projectId: string
  repo: string
  queue: QueueState
}

export interface HubSettings {
  autoSyncIntervalMs?: number
}

export interface GhfsRpc {
  capabilities: () => Promise<GhfsCapabilities>
  listProjects: () => Promise<ProjectSummary[]>
  initialPayload: (projectId: string) => Promise<ProjectInitialPayload>
  triggerSync: (projectId: string, options?: SyncTriggerOptions) => Promise<SyncSummary>
  executeQueue: (projectId: string, options?: ExecuteTriggerOptions) => Promise<ExecutionResult>
  addQueueOp: (projectId: string, op: PendingOp) => Promise<QueueState>
  updateQueueOp: (projectId: string, id: string, op: PendingOp) => Promise<QueueState>
  removeQueueOp: (projectId: string, id: string) => Promise<QueueState>
  clearQueue: (projectId: string) => Promise<QueueState>
  checkRemote: (projectId: string) => Promise<RemoteStatus>
  openInEditor: (projectId: string, filePath: string) => Promise<void>
  saveUiState: (projectId: string, state: UiState) => Promise<void>
  getPullPatch: (projectId: string, number: number) => Promise<string | null>
  getProjectIcon: (projectId: string) => Promise<string | null>
  projectActivity: (projectId: string, days?: number) => Promise<ActivityResult>
  hubActivity: (days?: number) => Promise<ActivityResult>
  hubInfo: () => Promise<HubInfo>
  hubScan: () => Promise<HubScannedProject[]>
  hubEnable: (path: string) => Promise<{ id: string }>
  hubDisable: (id: string) => Promise<{ removed: boolean }>
  hubAddRoot: (path: string) => Promise<HubInfo>
  hubRemoveRoot: (path: string) => Promise<HubInfo>
  hubRecentItems: (limit?: number) => Promise<HubRecentItem[]>
  hubQueue: () => Promise<HubQueueGroup[]>
  hubExecuteQueue: (options?: { projectId?: string }) => Promise<ExecutionResult[]>
  hubSettings: () => Promise<HubSettings>
  hubSetSettings: (patch: Partial<HubSettings>) => Promise<HubSettings>
}

let singleton: GhfsRpc | null = null
let bootPromise: Promise<GhfsCapabilities> | null = null

/**
 * Resolve the WebSocket URL for the ghfs backend. In production the SPA
 * is served from the same origin as the WS, so `window.location.host`
 * is correct. In dev, Nuxt's Vite serves the SPA on a different port
 * (7711) while the ghfs server hosts the WS on 7710 — using the wrong
 * port caused `ECONNRESET` storms because Vite has no `/__ws` route.
 */
function resolveWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname
  const port = import.meta.env?.DEV ? '7710' : window.location.port
  return `${proto}//${host}${port ? `:${port}` : ''}/__ws`
}

export function useRpc(): GhfsRpc {
  if (!singleton)
    singleton = createGhfsRpcClient()
  return singleton
}

export function useCapabilities(): Promise<GhfsCapabilities> {
  if (!bootPromise)
    bootPromise = useRpc().capabilities()
  return bootPromise
}

function createGhfsRpcClient(): GhfsRpc {
  if (typeof window === 'undefined') {
    // SSR/build placeholder
    return makeNoopRpc()
  }

  const clientHandlers = createClientHandlers()

  const channel = createWsChannelLazy()
  const rpc = createRpcClient<GhfsServerFunctions, GhfsClientFunctions>(
    clientHandlers,
    {
      channel,
      rpcOptions: { timeout: 120_000 },
    },
  )

  // birpc client with `proxify: false` does not auto-proxy remote method
  // access. Use `$call(name, ...args)` to invoke remote functions. We
  // cast away the strict type because `$call` infers from the literal
  // method name and our names contain colons.
  const call: (name: string, ...args: unknown[]) => Promise<unknown> = (name, ...args) => (rpc as any).$call(name as any, ...args)

  return {
    capabilities: () => call('ghfs:capabilities') as Promise<GhfsCapabilities>,
    listProjects: () => call('ghfs:list-projects') as Promise<ProjectSummary[]>,
    initialPayload: (projectId: string) => call('ghfs:initial-payload', projectId) as Promise<ProjectInitialPayload>,
    triggerSync: (projectId: string, options?: SyncTriggerOptions) => call('ghfs:trigger-sync', projectId, options ?? {}) as Promise<SyncSummary>,
    executeQueue: (projectId: string, options?: ExecuteTriggerOptions) => call('ghfs:execute-queue', projectId, options ?? {}) as Promise<ExecutionResult>,
    addQueueOp: (projectId, op) => call('ghfs:add-queue-op', projectId, op) as Promise<QueueState>,
    updateQueueOp: (projectId, id, op) => call('ghfs:update-queue-op', projectId, id, op) as Promise<QueueState>,
    removeQueueOp: (projectId, id) => call('ghfs:remove-queue-op', projectId, id) as Promise<QueueState>,
    clearQueue: projectId => call('ghfs:clear-queue', projectId) as Promise<QueueState>,
    checkRemote: projectId => call('ghfs:check-remote', projectId) as Promise<RemoteStatus>,
    openInEditor: (projectId, filePath) => call('ghfs:open-in-editor', projectId, filePath) as Promise<void>,
    saveUiState: (projectId, state) => call('ghfs:save-ui-state', projectId, state) as Promise<void>,
    getPullPatch: (projectId, number) => call('ghfs:get-pull-patch', projectId, number) as Promise<string | null>,
    getProjectIcon: projectId => call('ghfs:get-project-icon', projectId) as Promise<string | null>,
    projectActivity: (projectId, days) => call('ghfs:project-activity', projectId, days) as Promise<ActivityResult>,
    hubActivity: days => call('ghfs:hub-activity', days) as Promise<ActivityResult>,
    hubInfo: () => call('ghfs:hub-info') as Promise<HubInfo>,
    hubScan: () => call('ghfs:hub-scan') as Promise<HubScannedProject[]>,
    hubEnable: path => call('ghfs:hub-enable', path) as Promise<{ id: string }>,
    hubDisable: id => call('ghfs:hub-disable', id) as Promise<{ removed: boolean }>,
    hubAddRoot: path => call('ghfs:hub-add-root', path) as Promise<HubInfo>,
    hubRemoveRoot: path => call('ghfs:hub-remove-root', path) as Promise<HubInfo>,
    hubRecentItems: limit => call('ghfs:hub-recent-items', limit) as Promise<HubRecentItem[]>,
    hubQueue: () => call('ghfs:hub-queue') as Promise<HubQueueGroup[]>,
    hubExecuteQueue: options => call('ghfs:hub-execute-queue', options ?? {}) as Promise<ExecutionResult[]>,
    hubSettings: () => call('ghfs:hub-settings') as Promise<HubSettings>,
    hubSetSettings: patch => call('ghfs:hub-set-settings', patch) as Promise<HubSettings>,
  }
}

function createClientHandlers(): GhfsClientFunctions {
  return {
    'ghfs:onSyncStageStart': (event) => {
      const state = useAppState(event.projectId)
      state.setSyncing(true)
      state.setProgress({ kind: 'sync', stage: event.stage, message: event.message })
    },
    'ghfs:onSyncProgress': (event) => {
      const state = useAppState(event.projectId)
      const total = event.snapshot.selected || event.snapshot.scanned
      const percent = total > 0 ? Math.min(1, event.snapshot.processed / total) : undefined
      state.setProgress({
        kind: 'sync',
        stage: event.stage,
        message: event.message,
        processed: event.snapshot.processed,
        total: event.snapshot.selected,
        percent,
      })
    },
    'ghfs:onSyncStageEnd': () => {},
    'ghfs:onSyncComplete': (event) => {
      const state = useAppState(event.projectId)
      state.setProgress(null)
      state.setSyncing(false)
      // In hub mode, refresh the aggregate project list so the home cards
      // pick up the new lastSyncedAt + open counts after a sync completes
      // even when the per-project view isn't mounted.
      const hub = useHubState()
      if (hub.capabilities.value?.mode === 'hub') {
        useRpc().listProjects().then(p => hub.setProjects(p)).catch(() => {})
      }
    },
    'ghfs:onSyncError': (event) => {
      const state = useAppState(event.projectId)
      state.setError(`Sync failed: ${event.message}`)
      state.setProgress(null)
      state.setSyncing(false)
    },
    'ghfs:onExecuteStart': (event) => {
      const state = useAppState(event.projectId)
      state.setExecuting(true)
      state.setProgress({
        kind: 'execute',
        message: event.planned > 0 ? `Executing ${event.planned} ops…` : 'Executing…',
        processed: 0,
        total: event.planned,
        percent: 0,
      })
    },
    'ghfs:onExecuteProgress': (event) => {
      const state = useAppState(event.projectId)
      state.setProgress({
        kind: 'execute',
        message: event.detail?.message,
        processed: event.completed,
        total: event.planned,
        percent: event.planned > 0 ? event.completed / event.planned : undefined,
      })
    },
    'ghfs:onExecuteComplete': (event) => {
      const state = useAppState(event.projectId)
      state.setProgress(null)
      state.setExecuting(false)
    },
    'ghfs:onExecuteError': (event) => {
      const state = useAppState(event.projectId)
      state.setError(`Execute failed: ${event.message}`)
      state.setProgress(null)
      state.setExecuting(false)
    },
    'ghfs:onSyncStateChange': (event) => {
      useAppState(event.projectId).patchSyncState(event.state)
      invalidateProjectActivity(event.projectId)
      invalidateHubActivity()
    },
    'ghfs:onQueueChange': (event) => {
      useAppState(event.projectId).patchQueue(event.queue)
      if (useHubState().capabilities.value?.mode === 'hub')
        useHubQueue().load()
    },
    'ghfs:onRemoteStatusChange': (event) => {
      useAppState(event.projectId).patchRemote(event.status)
    },
    'ghfs:onProjectsChange': () => {
      // Server signals that the enabled-project set changed; refetch the
      // full summary so we see updated counts / timestamps.
      const rpc = useRpc()
      rpc.listProjects().then((projects) => {
        useHubState().setProjects(projects)
      }).catch(() => {})
    },
    'ghfs:onHubInfoChange': (event) => {
      useHubState().setHubInfo(event)
    },
  }
}

function createWsChannelLazy(): ReturnType<typeof createWsRpcChannel> {
  return createWsRpcChannel({
    url: resolveWsUrl(),
    onDisconnected: () => {
      // The devframe client transparently reconnects; nothing to do here.
    },
    onError: () => {
      // Errors are surfaced via close; ignore here.
    },
  })
}

function makeNoopRpc(): GhfsRpc {
  const reject = () => Promise.reject(new Error('RPC not available (SSR)'))
  return {
    capabilities: reject as never,
    listProjects: reject as never,
    initialPayload: reject as never,
    triggerSync: reject as never,
    executeQueue: reject as never,
    addQueueOp: reject as never,
    updateQueueOp: reject as never,
    removeQueueOp: reject as never,
    clearQueue: reject as never,
    checkRemote: reject as never,
    openInEditor: reject as never,
    saveUiState: reject as never,
    getPullPatch: reject as never,
    getProjectIcon: reject as never,
    projectActivity: reject as never,
    hubActivity: reject as never,
    hubInfo: reject as never,
    hubScan: reject as never,
    hubEnable: reject as never,
    hubDisable: reject as never,
    hubAddRoot: reject as never,
    hubRemoveRoot: reject as never,
    hubRecentItems: reject as never,
    hubQueue: reject as never,
    hubExecuteQueue: reject as never,
    hubSettings: reject as never,
    hubSetSettings: reject as never,
  }
}
