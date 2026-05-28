import type { GhfsCapabilities, GhfsClientFunctions, GhfsServerFunctions } from '#ghfs/rpc-types'
import type { SyncStage } from '#ghfs/sync-contracts'
import type { DevframeRpcClient } from 'devframe/client'
import { connectDevframe } from 'devframe/client'
import { useAppState } from './useAppState'
import type { ProgressCurrentItem } from './useAppState'
import { invalidateHubActivity } from './useHubActivity'
import { useHubQueue } from './useHubQueue'
import { useHubState } from './useHubState'
import { useOnlineState } from './useOnlineState'
import { invalidateProjectActivity } from './useProjectActivity'

const ALL_SYNC_STAGES: SyncStage[] = ['metadata', 'pagination', 'fetch', 'materialize', 'prune', 'save']

// The sync engine emits `formatIssueNumber()` output in fetch-stage messages,
// which wraps the issue label in an OSC-8 terminal hyperlink for CLI users.
// Those escape codes are noise in the browser — strip OSC and CSI sequences
// before showing or parsing the message.
function stripAnsi(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/\][^]*(?:|\\)/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\[[0-9;]*[a-zA-Z]/g, '')
}

function parseFetchMessage(message: string | undefined): ProgressCurrentItem | undefined {
  if (!message)
    return undefined
  const match = stripAnsi(message).match(/#(\d+)\s+(issue|pull)\s+(\w+)/)
  if (!match)
    return undefined
  return {
    number: Number(match[1]),
    kind: match[2] as 'issue' | 'pull',
    action: match[3],
  }
}

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
let clientPromise: Promise<DevframeRpcClient> | null = null

function ensureClient(): Promise<DevframeRpcClient> {
  if (clientPromise)
    return clientPromise
  // Fetch our own `/__connection.json` and pass the result explicitly.
  //
  // Why not let devframe fetch it via `baseURL`? Because
  // `connectDevframe()` first checks `window.__DEVFRAME_CONNECTION_META__`,
  // and the newer Vite/Nuxt DevTools sets that global to point at the
  // Nuxt dev server's own WS — which lands devframe on the wrong port
  // (the SPA port, not the paired ghfs server's port). Passing
  // `connectionMeta` explicitly skips that lookup.
  //
  // In dev, `/__connection.json` is handled by the Nitro route at
  // `server/routes/__connection.json.ts`, which proxies to whichever
  // port the paired ghfs server bound to (via `VITE_GHFS_WS_PORT`). In
  // prod, the SPA is served by the ghfs server itself, so the same
  // request resolves to the same JSON without any proxy.
  clientPromise = (async () => {
    const meta = await fetch('/__connection.json').then(r => r.json())
    const client = await connectDevframe({ connectionMeta: meta })
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
  })()
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
export function useRpcClient(): Promise<DevframeRpcClient> {
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
      const prev = state.progress.value
      state.setProgress({
        kind: 'sync',
        phase: 'running',
        stage: event.stage,
        message: stripAnsi(event.message),
        startedAt: prev?.startedAt ?? Date.now(),
        snapshot: prev?.snapshot,
        currentItem: event.stage === 'fetch' ? prev?.currentItem : undefined,
        stageHistory: prev?.stageHistory ?? [],
      })
    },
    'ghfs:onSyncProgress': (event) => {
      const state = useAppState(event.projectId)
      const prev = state.progress.value
      const total = event.snapshot.selected || event.snapshot.scanned
      const percent = total > 0 ? Math.min(1, event.snapshot.processed / total) : undefined
      const parsedItem = event.stage === 'fetch' ? parseFetchMessage(event.message) : undefined
      state.setProgress({
        kind: 'sync',
        phase: 'running',
        stage: event.stage,
        message: event.message ? stripAnsi(event.message) : undefined,
        processed: event.snapshot.processed,
        total: event.snapshot.selected,
        percent,
        startedAt: prev?.startedAt ?? Date.now(),
        snapshot: event.snapshot,
        currentItem: parsedItem ?? (event.stage === 'fetch' ? prev?.currentItem : undefined),
        stageHistory: prev?.stageHistory ?? [],
      })
    },
    'ghfs:onSyncStageEnd': (event) => {
      const state = useAppState(event.projectId)
      const prev = state.progress.value
      if (!prev || prev.kind !== 'sync')
        return
      const history = prev.stageHistory ?? []
      if (history.includes(event.stage))
        return
      state.setProgress({ ...prev, stageHistory: [...history, event.stage] })
    },
    'ghfs:onSyncComplete': (event) => {
      const state = useAppState(event.projectId)
      const prev = state.progress.value
      const startedAt = prev?.startedAt ?? Date.now()
      state.setProgress({
        kind: 'sync',
        phase: 'success',
        startedAt,
        snapshot: prev?.snapshot,
        stageHistory: [...ALL_SYNC_STAGES],
        summary: event.summary,
        processed: prev?.total,
        total: prev?.total,
        percent: 1,
      })
      state.setSyncing(false)
      // Auto-dismiss the success state after a short dwell. Guard against
      // races: only clear if the same successful run is still showing.
      const stamp = event.summary.syncedAt
      setTimeout(() => {
        const current = state.progress.value
        if (current?.phase === 'success' && current.summary?.syncedAt === stamp)
          state.setProgress(null)
      }, 3500)
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
      if (useOnlineState().offline.value) {
        // Backend's auto-sync interval keeps firing while offline; suppress
        // the noisy error toast and just clear the in-flight flag.
        state.setProgress(null)
        state.setSyncing(false)
        return
      }
      const prev = state.progress.value
      state.setProgress({
        kind: 'sync',
        phase: 'error',
        message: event.message,
        errorStage: prev?.stage,
        startedAt: prev?.startedAt ?? Date.now(),
        snapshot: prev?.snapshot,
        stageHistory: prev?.stageHistory ?? [],
      })
      state.setSyncing(false)
    },
    'ghfs:onExecuteStart': (event) => {
      const state = useAppState(event.projectId)
      state.setExecuting(true)
      state.setProgress({
        kind: 'execute',
        phase: 'running',
        message: event.planned > 0 ? `Executing ${event.planned} operation${event.planned === 1 ? '' : 's'}…` : 'Executing…',
        processed: 0,
        total: event.planned,
        percent: 0,
        startedAt: Date.now(),
      })
    },
    'ghfs:onExecuteProgress': (event) => {
      const state = useAppState(event.projectId)
      const prev = state.progress.value
      state.setProgress({
        kind: 'execute',
        phase: 'running',
        message: event.detail?.message,
        processed: event.completed,
        total: event.planned,
        percent: event.planned > 0 ? event.completed / event.planned : undefined,
        startedAt: prev?.startedAt ?? Date.now(),
      })
    },
    'ghfs:onExecuteComplete': (event) => {
      const state = useAppState(event.projectId)
      const prev = state.progress.value
      const applied = event.result?.applied ?? prev?.processed ?? 0
      const planned = event.result?.planned ?? prev?.total ?? 0
      state.setProgress({
        kind: 'execute',
        phase: 'success',
        message: `Applied ${applied} of ${planned}`,
        processed: applied,
        total: planned,
        percent: 1,
        startedAt: prev?.startedAt,
      })
      state.setExecuting(false)
      const startedStamp = prev?.startedAt
      setTimeout(() => {
        const current = state.progress.value
        if (current?.phase === 'success' && current.kind === 'execute' && current.startedAt === startedStamp)
          state.setProgress(null)
      }, 3500)
    },
    'ghfs:onExecuteError': (event) => {
      const state = useAppState(event.projectId)
      if (useOnlineState().offline.value) {
        state.setProgress(null)
        state.setExecuting(false)
        return
      }
      const prev = state.progress.value
      state.setProgress({
        kind: 'execute',
        phase: 'error',
        message: event.message,
        startedAt: prev?.startedAt,
        processed: prev?.processed,
        total: prev?.total,
        percent: prev?.percent,
      })
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
