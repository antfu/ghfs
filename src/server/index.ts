import type { BirpcReturn } from 'birpc'
import type { WebSocket } from 'ws'
import type { GhfsResolvedConfig } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { ServerContext } from './context'
import type { ClientFunctions, ServerFunctions } from './types'
import { Buffer } from 'node:buffer'
import { createServer as createHttpServer } from 'node:http'
import { createBirpc } from 'birpc'
import { getPort } from 'get-port-please'
import {
  createApp,
  createRouter,
  eventHandler,
  setResponseHeader,
  setResponseStatus,
  toNodeListener,
} from 'h3'
import { join, resolve } from 'pathe'
import { parse, stringify } from 'structured-clone-es'
import { WebSocketServer } from 'ws'
import { getExecuteFile } from '../config/load'
import { distDir } from '../dir'
import { GHFS_VERSION } from '../meta'
import { createRepositoryProvider } from '../providers/factory'
import { loadSyncState } from '../sync/state'
import { createRemotePoller } from './poller'
import { registerPortlessRoute } from './portless'
import { buildQueueState } from './queue-builder'
import { createServerFunctions } from './rpc'
import { createStaticHandler } from './static'
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

export interface UiServerLogger {
  info?: (message: string) => void
  warn?: (message: string) => void
}

export interface PortlessServerOptions {
  enabled: boolean
  subdomain: string
  namespace?: string
}

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
  /** When provided and enabled, expose the UI through portless at https://<subdomain>.<namespace>.localhost. */
  portless?: PortlessServerOptions
  /** Logger for non-fatal notices (e.g. portless fallback). */
  logger?: UiServerLogger
}

export interface UiServerHandle {
  /** The preferred URL to open — the portless URL when available, otherwise the direct URL. */
  url: string
  /** The raw `http://host:port` URL, always available. */
  directUrl: string
  /** The portless URL when the reverse proxy was set up successfully. */
  portlessUrl?: string
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
    const staticDir = join(distDir, 'ui')
    app.use('/', await createStaticHandler(staticDir))
  }

  const port = await getPort({
    port: options.port,
    portRange: [options.port, options.port + 19],
    host: options.host,
  })

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

  await new Promise<void>((resolvePromise, rejectPromise) => {
    httpServer.once('error', rejectPromise)
    httpServer.listen(port, options.host, () => {
      httpServer.off('error', rejectPromise)
      resolvePromise()
    })
  })
  const urlHost = options.host === '0.0.0.0' ? 'localhost' : options.host
  const directUrl = `http://${urlHost}:${port}`

  let portlessUrl: string | undefined
  let portlessUnregister: (() => Promise<void>) | undefined
  if (options.portless?.enabled) {
    try {
      const route = await registerPortlessRoute({
        subdomain: options.portless.subdomain,
        namespace: options.portless.namespace,
        port,
      })
      portlessUrl = route.url
      portlessUnregister = route.unregister
    }
    catch (error) {
      const message = (error as Error).message || String(error)
      options.logger?.info?.(`portless unavailable (${message}); falling back to ${directUrl}`)
    }
  }

  return {
    url: portlessUrl ?? directUrl,
    directUrl,
    portlessUrl,
    port,
    host: options.host,
    close: async () => {
      if (portlessUnregister)
        await portlessUnregister()
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

function rawToString(raw: unknown): string {
  if (typeof raw === 'string')
    return raw
  if (raw instanceof Uint8Array)
    return Buffer.from(raw).toString('utf-8')
  if (Array.isArray(raw))
    return Buffer.concat(raw as Uint8Array[]).toString('utf-8')
  return String(raw)
}
