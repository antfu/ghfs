import type { ClientFunctions, ServerFunctions, SyncProgressPayload } from '#ghfs/server-types'
import type { BirpcReturn } from 'birpc'
import { createBirpc } from 'birpc'
import { parse, stringify } from 'structured-clone-es'
import { log } from '../utils/logger'

let singleton: BirpcReturn<ServerFunctions, ClientFunctions> | null = null
let currentSocket: WebSocket | null = null
let messageHandler: ((data: unknown) => void) | null = null
let reconnectAttempts = 0

export function useRpc(): BirpcReturn<ServerFunctions, ClientFunctions> {
  if (!singleton)
    singleton = createClient()
  return singleton
}

function createClient(): BirpcReturn<ServerFunctions, ClientFunctions> {
  const state = useAppState()

  const clientFunctions: ClientFunctions = {
    onSyncStageStart({ stage, message }) {
      state.setSyncing(true)
      state.setProgress({ kind: 'sync', stage, message })
    },
    onSyncProgress(payload: SyncProgressPayload) {
      const total = payload.snapshot.selected || payload.snapshot.scanned
      const percent = total > 0 ? Math.min(1, payload.snapshot.processed / total) : undefined
      state.setProgress({
        kind: 'sync',
        stage: payload.stage,
        message: payload.message,
        processed: payload.snapshot.processed,
        total: payload.snapshot.selected,
        percent,
      })
    },
    onSyncStageEnd() {},
    onSyncComplete() {
      state.setProgress(null)
      state.setSyncing(false)
    },
    onSyncError(message: string) {
      state.setError(`Sync failed: ${message}`)
      state.setProgress(null)
      state.setSyncing(false)
    },
    onExecuteStart({ planned }) {
      state.setExecuting(true)
      state.setProgress({
        kind: 'execute',
        message: planned > 0 ? `Executing ${planned} ops…` : 'Executing…',
        processed: 0,
        total: planned,
        percent: 0,
      })
    },
    onExecuteProgress({ completed, planned, detail }) {
      state.setProgress({
        kind: 'execute',
        message: detail.message,
        processed: completed,
        total: planned,
        percent: planned > 0 ? completed / planned : undefined,
      })
    },
    onExecuteComplete() {
      state.setProgress(null)
      state.setExecuting(false)
    },
    onExecuteError(message: string) {
      state.setError(`Execute failed: ${message}`)
      state.setProgress(null)
      state.setExecuting(false)
    },
    onSyncStateChange(next) {
      state.patchSyncState(next)
    },
    onQueueChange(next) {
      state.patchQueue(next)
    },
    onRemoteStatusChange(next) {
      state.patchRemote(next)
    },
  }

  const rpc = createBirpc<ServerFunctions, ClientFunctions>(clientFunctions, {
    post: (data) => {
      if (currentSocket?.readyState === WebSocket.OPEN)
        currentSocket.send(data)
    },
    on: (fn) => { messageHandler = fn },
    serialize: data => stringify(data),
    deserialize: data => parse(typeof data === 'string' ? data : String(data)),
    timeout: 120_000,
  })

  if (typeof window !== 'undefined')
    connect(rpc)

  return rpc
}

function connect(rpc: BirpcReturn<ServerFunctions, ClientFunctions>): void {
  if (typeof window === 'undefined')
    return

  const socket = new WebSocket(resolveWsUrl())

  socket.addEventListener('open', async () => {
    currentSocket = socket
    reconnectAttempts = 0
    try {
      const initial = await rpc.getInitialPayload()
      useAppState().setPayload(initial)
      try {
        useUiState().hydrate(initial.uiState)
      }
      catch (error) {
        // Older server builds may not return uiState; don't crash the app.
        log.GHFS0950({ detail: String((error as Error)?.message ?? error) }, { cause: error }).warn()
        useUiState().hydrate(undefined)
      }
    }
    catch (error) {
      useAppState().setError(`Failed to hydrate: ${(error as Error).message}`)
    }
  })

  socket.addEventListener('message', (event) => {
    messageHandler?.(event.data)
  })

  socket.addEventListener('close', () => {
    if (currentSocket === socket)
      currentSocket = null
    reconnectAttempts += 1
    const delay = Math.min(1_000 * 2 ** Math.min(reconnectAttempts, 5), 30_000)
    window.setTimeout(() => connect(rpc), delay)
  })

  socket.addEventListener('error', () => {
    // socket closes shortly after; reconnect handled via close handler
  })
}

function resolveWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // In dev, Nuxt serves the UI on :7711 but the ghfs server (with WS) is
  // on :7710. Connect directly to avoid routing WS through Vite's proxy.
  const devPort = import.meta.env?.DEV ? '7710' : ''
  const host = devPort
    ? `${window.location.hostname}:${devPort}`
    : window.location.host
  return `${proto}//${host}/__ws`
}
