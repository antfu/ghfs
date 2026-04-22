import type { BirpcReturn } from 'birpc'
import type { Server } from 'node:http'
import type { WebSocket } from 'ws'
import type { GhfsResolvedConfig } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { ServerContext } from './context'
import type { ClientFunctions, ServerFunctions } from './types'
import { Buffer } from 'node:buffer'
import { createServer as createHttpServer } from 'node:http'
import process from 'node:process'
import { createBirpc } from 'birpc'
import {
  createApp,
  createRouter,
  eventHandler,
  setResponseHeader,
  setResponseStatus,
  toNodeListener,
} from 'h3'
import { resolve } from 'pathe'
import { parse, stringify } from 'structured-clone-es'
import { WebSocketServer } from 'ws'
import { getExecuteFile } from '../config/load'
import { GHFS_VERSION } from '../meta'
import { createRepositoryProvider } from '../providers/factory'
import { loadSyncState } from '../sync/state'
import { createRemotePoller } from './poller'
import { buildQueueState } from './queue-builder'
import { createServerFunctions } from './rpc'
import { createStaticHandler, resolveDefaultStaticDir } from './static'
import { createGhfsWatcher } from './watcher'

export type { ClientFunctions, InitialPayload, QueueEntry, QueueState, RemoteStatus, RepoMeta, ServerFunctions } from './types'

const EVENT_NAMES: (keyof ClientFunctions)[] = [
  'onSyncStageStart',
  'onSyncProgress',
  'onSyncStageEnd',
  'onSyncComplete',
  'onSyncError',
  'onExecuteStart',
  'onExecuteProgress',
  'onExecuteComplete',
  'onExecuteError',
  'onSyncStateChange',
  'onQueueChange',
  'onRemoteStatusChange',
]

export interface CreateUiServerOptions {
  config: GhfsResolvedConfig
  repo: string
  initialToken?: string
  port: number
  host: string
  onRequestToken?: () => Promise<string>
  /** Override the directory serving the prebuilt Nuxt SPA. */
  staticDir?: string
  /** When true, skip serving static assets (dev proxies to Nuxt dev server). */
  devMode?: boolean
  /** Poller tick interval; default 60_000. */
  pollerIntervalMs?: number
}

export interface UiServerHandle {
  url: string
  port: number
  host: string
  close: () => Promise<void>
}

export async function createUiServer(options: CreateUiServerOptions): Promise<UiServerHandle> {
  const storageDirAbsolute = resolve(options.config.cwd, options.config.directory)
  const executeFilePath = resolve(options.config.cwd, getExecuteFile(options.config))

  let cachedToken = options.initialToken ?? ''
  async function getToken(): Promise<string> {
    if (cachedToken)
      return cachedToken
    if (options.onRequestToken) {
      cachedToken = await options.onRequestToken()
      return cachedToken
    }
    throw new Error('Missing GitHub token')
  }

  let cachedProvider: RepositoryProvider | undefined
  async function getProvider(): Promise<RepositoryProvider | null> {
    if (cachedProvider)
      return cachedProvider
    let token: string
    try {
      token = await getToken()
    }
    catch {
      return null
    }
    if (!token)
      return null
    cachedProvider = createRepositoryProvider({ token, repo: options.repo })
    return cachedProvider
  }

  let lastSyncedAt = (await loadSyncState(storageDirAbsolute)).lastSyncedAt

  const clients = new Set<BirpcReturn<ClientFunctions, ServerFunctions>>()
  const broadcast = createBroadcast(clients)

  const poller = createRemotePoller({
    intervalMs: options.pollerIntervalMs,
    getProvider,
    getSince: () => lastSyncedAt,
    onUpdate: status => broadcast.onRemoteStatusChange(status),
  })

  const ctx: ServerContext = {
    config: options.config,
    repo: options.repo,
    storageDirAbsolute,
    executeFilePath,
    getToken,
    getProvider,
    broadcast,
    poller,
  }
  const serverFunctions = createServerFunctions(ctx)

  const watcher = await createGhfsWatcher({
    storageDirAbsolute,
    onSyncStateChange: async () => {
      const state = await loadSyncState(storageDirAbsolute)
      lastSyncedAt = state.lastSyncedAt
      broadcast.onSyncStateChange(state)
    },
    onQueueChange: async () => {
      const queue = await buildQueueState({ storageDirAbsolute, executeFilePath })
      broadcast.onQueueChange(queue)
    },
  })

  const app = createApp()
  const router = createRouter()
  router.get('/api/metadata.json', eventHandler(() => ({
    repo: options.repo,
    storageDir: options.config.directory,
    ghfsVersion: GHFS_VERSION,
    wsPath: '/__ws',
    devMode: Boolean(options.devMode),
  })))
  app.use(router)

  if (options.devMode) {
    app.use('/', eventHandler((event) => {
      setResponseStatus(event, 200)
      setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
      return `ghfs ui dev mode — open http://localhost:7711 for the Vite-powered UI.\n`
    }))
  }
  else {
    const staticDir = options.staticDir ?? resolveDefaultStaticDir(import.meta.url)
    app.use('/', await createStaticHandler(staticDir))
  }

  const httpServer = createHttpServer(toNodeListener(app))
  const wss = new WebSocketServer({ server: httpServer, path: '/__ws' })

  wss.on('connection', (socket: WebSocket) => {
    const rpc = createBirpc<ClientFunctions, ServerFunctions>(serverFunctions, {
      post: data => socket.send(data),
      on: fn => socket.on('message', (raw) => {
        fn(rawToString(raw))
      }),
      serialize: data => stringify(data),
      deserialize: raw => parse(rawToString(raw)),
      timeout: 120_000,
      eventNames: EVENT_NAMES,
    })
    clients.add(rpc)
    socket.on('close', () => {
      clients.delete(rpc)
    })
    socket.on('error', () => {
      clients.delete(rpc)
    })
  })

  const port = await bindToPort(httpServer, options.port, options.host)
  const urlHost = options.host === '0.0.0.0' ? 'localhost' : options.host
  const url = `http://${urlHost}:${port}`

  return {
    url,
    port,
    host: options.host,
    close: async () => {
      poller.close()
      await watcher.close()
      await new Promise<void>(resolveClose => wss.close(() => resolveClose()))
      await new Promise<void>(resolveClose => httpServer.close(() => resolveClose()))
    },
  }
}

function createBroadcast(
  clients: Set<BirpcReturn<ClientFunctions, ServerFunctions>>,
): ServerContext['broadcast'] {
  const target = {} as ServerContext['broadcast']
  return new Proxy(target, {
    get(_, prop: string | symbol) {
      if (typeof prop !== 'string')
        return undefined
      return (...args: unknown[]) => {
        for (const rpc of clients) {
          try {
            const fn = (rpc as unknown as Record<string, (...args: unknown[]) => void>)[prop]
            if (typeof fn === 'function')
              fn(...args)
          }
          catch {
            // swallow: broadcast is best-effort
          }
        }
      }
    },
  })
}

async function bindToPort(server: Server, preferred: number, host: string): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = preferred + attempt
    const bound = await tryBind(server, candidate, host)
    if (bound)
      return candidate
  }
  throw new Error(`Could not bind to a port near ${preferred} on ${host}`)
}

function tryBind(server: Server, port: number, host: string): Promise<boolean> {
  return new Promise<boolean>((resolvePromise) => {
    let settled = false
    function settle(value: boolean) {
      if (settled)
        return
      settled = true
      server.off('error', handleError)
      server.off('listening', handleListening)
      resolvePromise(value)
    }
    function handleListening() {
      settle(true)
    }
    function handleError(error: NodeJS.ErrnoException) {
      if (error.code === 'EADDRINUSE') {
        settle(false)
        return
      }
      settle(false)
      process.nextTick(() => {
        throw error
      })
    }
    server.once('error', handleError)
    server.once('listening', handleListening)
    server.listen(port, host)
  })
}

function rawToString(raw: unknown): string {
  if (typeof raw === 'string')
    return raw
  if (raw instanceof Uint8Array)
    return Buffer.from(raw).toString('utf-8')
  if (Array.isArray(raw))
    return Buffer.concat(raw as Uint8Array[]).toString('utf-8')
  return String(raw)
}
