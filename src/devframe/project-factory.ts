import type { DevframeNodeContext } from 'devframe'
import type { GhfsResolvedConfig } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { ProjectBroadcast, ProjectContext } from './project-context'
import { resolve } from 'pathe'
import { getExecuteFile } from '../config/load'
import { createRepositoryProvider } from '../providers/factory'
import { createRemotePoller } from '../server/poller'
import { buildQueueState } from '../server/queue-builder'
import { createGhfsWatcher } from '../server/watcher'
import { loadSyncState } from '../sync/state'
import { PROJECT_EVENT_NAMES } from './rpc/types'

export interface BuildProjectOptions {
  /** Stable id used in RPC calls and SPA URLs. */
  id: string
  /** Display name (defaults to id). */
  name?: string
  /** Absolute project root directory. */
  path: string
  config: GhfsResolvedConfig
  repo: string
  /** Pre-resolved token; the project may still re-prompt later via `onRequestToken`. */
  initialToken?: string
  /** Called when the cached token is empty (re-prompt or refresh). */
  onRequestToken?: () => Promise<string>
  /** Poller tick — default 60s. Hub passes a slower tick. */
  pollerIntervalMs?: number
  devframeCtx: DevframeNodeContext
}

export async function buildProjectContext(options: BuildProjectOptions): Promise<ProjectContext> {
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
    return ''
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
  const projectId = options.id

  const broadcast: ProjectBroadcast = {
    onSyncStageStart: event => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onSyncStageStart' as never, args: [{ projectId, ...event }] as never }),
    onSyncProgress: event => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onSyncProgress' as never, args: [{ projectId, ...event }] as never }),
    onSyncStageEnd: event => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onSyncStageEnd' as never, args: [{ projectId, ...event }] as never }),
    onSyncComplete: summary => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onSyncComplete' as never, args: [{ projectId, summary }] as never }),
    onSyncError: message => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onSyncError' as never, args: [{ projectId, message }] as never }),
    onExecuteStart: event => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onExecuteStart' as never, args: [{ projectId, ...event }] as never }),
    onExecuteProgress: event => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onExecuteProgress' as never, args: [{ projectId, ...event }] as never }),
    onExecuteComplete: result => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onExecuteComplete' as never, args: [{ projectId, result }] as never }),
    onExecuteError: message => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onExecuteError' as never, args: [{ projectId, message }] as never }),
    onSyncStateChange: state => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onSyncStateChange' as never, args: [{ projectId, state }] as never }),
    onQueueChange: queue => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onQueueChange' as never, args: [{ projectId, queue }] as never }),
    onRemoteStatusChange: status => options.devframeCtx.rpc.broadcast({ method: 'ghfs:onRemoteStatusChange' as never, args: [{ projectId, status }] as never }),
  }

  const poller = createRemotePoller({
    intervalMs: options.pollerIntervalMs,
    getProvider,
    getSince: () => lastSyncedAt,
    onUpdate: status => broadcast.onRemoteStatusChange(status),
  })

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

  return {
    id: projectId,
    path: options.path,
    name: options.name ?? projectId,
    config: options.config,
    repo: options.repo,
    storageDirAbsolute,
    executeFilePath,
    getToken,
    getProvider,
    poller,
    watcher,
    broadcast,
  }
}

export async function closeProjectContext(ctx: ProjectContext): Promise<void> {
  ctx.poller.close()
  await ctx.watcher.close()
}

/** Reference list of broadcast event names exposed by every project. */
export { PROJECT_EVENT_NAMES }
