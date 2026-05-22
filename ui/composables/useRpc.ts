import type { GhfsCapabilities, GhfsClientFunctions, GhfsServerFunctions } from '#ghfs/rpc-types'
import type { BirpcReturn } from 'birpc'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'

export type GhfsRpc = BirpcReturn<GhfsServerFunctions, GhfsClientFunctions>

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
  if (!singleton) {
    singleton = typeof window === 'undefined'
      ? makeNoopRpc()
      : createBirpcClient()
  }
  return singleton
}

export function useCapabilities(): Promise<GhfsCapabilities> {
  if (!bootPromise)
    bootPromise = useRpc().$call('ghfs:capabilities')
  return bootPromise
}

function createBirpcClient(): GhfsRpc {
  const channel = createWsRpcChannel({
    url: resolveWsUrl(),
    onDisconnected: () => {
      // The devframe client transparently reconnects; nothing to do here.
    },
    onError: () => {
      // Errors are surfaced via close; ignore here.
    },
  })

  return createRpcClient<GhfsServerFunctions, GhfsClientFunctions>(
    createClientHandlers(),
    {
      channel,
      rpcOptions: { timeout: 120_000 },
    },
  )
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
        useRpc().$call('ghfs:list-projects').then(p => hub.setProjects(p)).catch(() => {})
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
      useRpc().$call('ghfs:list-projects').then((projects) => {
        useHubState().setProjects(projects)
      }).catch(() => {})
    },
    'ghfs:onHubInfoChange': (event) => {
      useHubState().setHubInfo(event)
    },
  }
}

function makeNoopRpc(): GhfsRpc {
  const reject = () => Promise.reject(new Error('RPC not available (SSR)'))
  return new Proxy({} as GhfsRpc, {
    get(_, prop) {
      if (prop === '$closed') return true
      if (prop === '$functions') return {}
      if (prop === '$close' || prop === '$rejectPendingCalls') return () => {}
      return reject
    },
  })
}
