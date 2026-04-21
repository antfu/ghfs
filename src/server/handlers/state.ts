import type { ServerContext } from '../context'
import type { InitialPayload, QueueState, RepoMeta } from '../types'
import { GHFS_VERSION } from '../../meta'
import { loadSyncState } from '../../sync/state'
import { buildQueueState } from '../queue-builder'

export function createStateHandlers(ctx: ServerContext): {
  getInitialPayload: () => Promise<InitialPayload>
  getSyncState: () => Promise<InitialPayload['syncState']>
  getQueue: () => Promise<QueueState>
  getRepoMeta: () => Promise<RepoMeta>
} {
  async function getRepoMeta(): Promise<RepoMeta> {
    const syncState = await loadSyncState(ctx.storageDirAbsolute)
    let hasToken = false
    try {
      const token = await ctx.getToken()
      hasToken = Boolean(token)
    }
    catch {
      hasToken = false
    }
    return {
      repo: ctx.repo,
      storageDir: ctx.config.directory,
      ghfsVersion: GHFS_VERSION,
      lastSyncedAt: syncState.lastSyncedAt,
      lastSince: syncState.lastSince,
      hasToken,
    }
  }

  async function getSyncState() {
    return loadSyncState(ctx.storageDirAbsolute)
  }

  async function getQueue(): Promise<QueueState> {
    return buildQueueState({
      storageDirAbsolute: ctx.storageDirAbsolute,
      executeFilePath: ctx.executeFilePath,
    })
  }

  async function getInitialPayload(): Promise<InitialPayload> {
    const [repo, syncState, queue] = await Promise.all([
      getRepoMeta(),
      getSyncState(),
      getQueue(),
    ])
    return {
      repo,
      syncState,
      queue,
      remote: ctx.poller.getCurrent(),
      recentExecutions: syncState.executions ?? [],
    }
  }

  return {
    getInitialPayload,
    getSyncState,
    getQueue,
    getRepoMeta,
  }
}
