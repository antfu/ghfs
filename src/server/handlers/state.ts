import type { ServerContext } from '../context'
import type { CurrentUser, InitialPayload, QueueState, RepoMeta, UiState } from '../types'
import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { GHFS_VERSION } from '../../meta'
import { loadRepoSnapshot } from '../../sync/repo-snapshot'
import { loadSyncState } from '../../sync/state'
import { buildQueueState } from '../queue-builder'
import { loadUiState, saveUiState } from '../ui-state'

export function createStateHandlers(ctx: ServerContext): {
  getInitialPayload: () => Promise<InitialPayload>
  getSyncState: () => Promise<InitialPayload['syncState']>
  getQueue: () => Promise<QueueState>
  getRepoMeta: () => Promise<RepoMeta>
  saveUiState: (state: UiState) => Promise<void>
  getPullPatch: (number: number) => Promise<string | null>
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
    const [repo, syncState, queue, uiState, snapshot] = await Promise.all([
      getRepoMeta(),
      getSyncState(),
      getQueue(),
      loadUiState(ctx.storageDirAbsolute),
      loadRepoSnapshot(ctx.storageDirAbsolute),
    ])
    const repositoryLabels = (snapshot?.labels ?? []).map(label => ({
      name: label.name,
      color: label.color,
      description: label.description,
    }))
    const currentUser = await resolveCurrentUser(ctx, uiState)
    return {
      repo,
      syncState,
      queue,
      remote: ctx.poller.getCurrent(),
      recentExecutions: syncState.executions ?? [],
      uiState,
      repositoryLabels,
      currentUser,
    }
  }

  async function getPullPatch(number: number): Promise<string | null> {
    const syncState = await loadSyncState(ctx.storageDirAbsolute)
    const tracked = syncState.items[String(number)]
    if (!tracked?.patchPath)
      return null
    try {
      return await readFile(join(ctx.storageDirAbsolute, tracked.patchPath), 'utf8')
    }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        return null
      throw err
    }
  }

  return {
    getInitialPayload,
    getSyncState,
    getQueue,
    getRepoMeta,
    saveUiState: (state: UiState) => saveUiState(ctx.storageDirAbsolute, state),
    getPullPatch,
  }
}

async function resolveCurrentUser(ctx: ServerContext, uiState: UiState): Promise<CurrentUser | null> {
  const override = uiState.userOverride
  let fetched: CurrentUser | null = null
  try {
    const provider = await ctx.getProvider()
    const user = await provider?.fetchAuthenticatedUser()
    if (user)
      fetched = { login: user.login, name: user.name, avatarUrl: user.avatarUrl }
  }
  catch {
    fetched = null
  }
  if (!override && !fetched)
    return null
  const login = override?.login ?? fetched?.login
  if (!login)
    return null
  return {
    login,
    name: override?.name ?? fetched?.name ?? null,
    avatarUrl: override?.avatarUrl ?? fetched?.avatarUrl ?? `https://avatars.githubusercontent.com/${login}`,
  }
}
