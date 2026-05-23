import type { GhfsCapabilities, GhfsClientFunctions, GhfsServerFunctions } from '#ghfs/rpc-types'
import type { DevToolsRpcClient } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

type CallFn = <K extends keyof GhfsServerFunctions>(
  name: K,
  ...args: Parameters<GhfsServerFunctions[K]>
) => ReturnType<GhfsServerFunctions[K]>

type EventFn = <K extends keyof GhfsServerFunctions>(
  name: K,
  ...args: Parameters<GhfsServerFunctions[K]>
) => void

export interface GhfsRpc {
  $call: CallFn
  $callEvent: EventFn
  $callOptional: CallFn
}

let rpcShim: GhfsRpc | null = null
let clientPromise: Promise<DevToolsRpcClient> | null = null

function ensureClient(): Promise<DevToolsRpcClient> {
  if (clientPromise)
    return clientPromise
  // In dev the Nuxt SPA runs on 7711 while the ghfs server hosts the
  // devframe runtime on 7710 — fetching `__connection.json` cross-origin
  // hits CORS, so hardcode `connectionMeta` and let devframe open the WS
  // directly (WS is not subject to SOP). In production the SPA is served
  // from the same origin; baseURL must be `/` rather than the default `./`
  // because deep-link routes (e.g. `/{owner}/{repo}/{n}`) would otherwise
  // resolve `__connection.json` relative to the route segment and 404.
  const connectOptions = import.meta.env?.DEV
    ? { connectionMeta: { backend: 'websocket' as const, websocket: 7710 } }
    : { baseURL: '/' }
  clientPromise = connectDevframe(connectOptions).then((client) => {
    // `connectDevframe` builds an empty client RPC host; re-register the
    // ghfs:on* broadcast handlers that the old `createRpcClient` accepted
    // as a function map (one entry per server-side event the UI cares about).
    const handlers = createClientHandlers()
    for (const [name, handler] of Object.entries(handlers)) {
      client.client.register({
        name: name as any,
        type: 'event',
        handler: handler as any,
      })
    }
    return client
  })
  return clientPromise
}

/**
 * Synchronous facade for the devframe RPC client. Callers can keep using
 * `useRpc().$call('ghfs:foo', …)` exactly as before — the shim defers
 * dispatch until the underlying `connectDevframe()` resolves.
 */
export function useRpc(): GhfsRpc {
  if (rpcShim)
    return rpcShim
  if (typeof window === 'undefined') {
    rpcShim = makeNoopRpc()
    return rpcShim
  }
  // Kick the connection off eagerly so the first `$call` doesn't pay the
  // full handshake cost.
  ensureClient()
  rpcShim = {
    $call: ((name, ...args) =>
      ensureClient().then(c => c.call(name as any, ...args as any))) as CallFn,
    $callEvent: ((name, ...args) => {
      ensureClient().then(c => c.callEvent(name as any, ...args as any)).catch(() => {})
    }) as EventFn,
    $callOptional: ((name, ...args) =>
      ensureClient().then(c => c.callOptional(name as any, ...args as any))) as CallFn,
  }
  return rpcShim
}

/**
 * Access the full devframe client — needed for `rpc.sharedState`,
 * `rpc.streaming`, etc. Resolves once the connection handshake completes.
 */
export function useRpcClient(): Promise<DevToolsRpcClient> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('devframe RPC not available (SSR)'))
  return ensureClient()
}

let bootPromise: Promise<GhfsCapabilities> | null = null

export function useCapabilities(): Promise<GhfsCapabilities> {
  if (!bootPromise)
    bootPromise = useRpc().$call('ghfs:capabilities')
  return bootPromise
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
  return {
    $call: reject as any,
    $callEvent: (() => {}) as any,
    $callOptional: reject as any,
  }
}
