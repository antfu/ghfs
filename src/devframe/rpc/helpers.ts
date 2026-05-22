import type { ExecuteTriggerOptions, InitialPayload, RepoMeta, SyncTriggerOptions } from '../../server/types'
import type { SyncSummary } from '../../sync/contracts'
import type { ExecutionResult } from '../../types/execution'
import type { ProjectContext, ProjectRegistry } from '../project-context'
import type { ProjectInitialPayload, ProjectSummary } from './types'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { isAbsolute, join, resolve } from 'pathe'
import { executePendingChanges } from '../../execute'
import { diagnostics } from '../../logger'
import { GHFS_VERSION } from '../../meta'
import { buildQueueState } from '../../server/queue-builder'
import { loadUiState } from '../../server/ui-state'
import { syncRepository } from '../../sync'
import { isCreatedToday } from '../../sync/activity'
import { getEffectiveUpdatedAt } from '../../sync/effective-updated'
import { loadRepoSnapshot } from '../../sync/repo-snapshot'
import { loadSyncState } from '../../sync/state'

/** Process-wide lock for `triggerSync`: prevents concurrent sync per project. */
export const syncRunning = new Set<string>()

/** Process-wide lock for `executeQueue`: prevents concurrent execute per project. */
export const executeRunning = new Set<string>()

export function notFound(projectId: string): never {
  throw diagnostics.GHFS0206({ detail: `Project not found: ${projectId}` })
}

export function requireProject(registry: ProjectRegistry, projectId: string): ProjectContext {
  const ctx = registry.getProject(projectId)
  if (!ctx)
    notFound(projectId)
  return ctx
}

export async function buildRepoMeta(ctx: ProjectContext): Promise<RepoMeta> {
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
    projectPath: ctx.path,
    ghfsVersion: GHFS_VERSION,
    lastSyncedAt: syncState.lastSyncedAt,
    lastSince: syncState.lastSince,
    hasToken,
  }
}

export async function summarizeProject(ctx: ProjectContext): Promise<ProjectSummary> {
  const [repo, syncState] = await Promise.all([
    buildRepoMeta(ctx),
    loadSyncState(ctx.storageDirAbsolute),
  ])
  let openIssues = 0
  let openPulls = 0
  let newIssuesToday = 0
  let newPullsToday = 0
  let lastActivityAt: string | undefined
  for (const item of Object.values(syncState.items)) {
    const updatedAt = getEffectiveUpdatedAt(item, ctx.config.bots)
    if (updatedAt && (!lastActivityAt || updatedAt > lastActivityAt))
      lastActivityAt = updatedAt
    if (isCreatedToday(item.data.item.createdAt)) {
      if (item.kind === 'issue')
        newIssuesToday += 1
      else
        newPullsToday += 1
    }
    if (item.state !== 'open')
      continue
    if (item.kind === 'issue')
      openIssues += 1
    else
      openPulls += 1
  }
  return {
    id: ctx.id,
    path: ctx.path,
    name: ctx.name,
    repo: repo.repo,
    storageDir: repo.storageDir,
    hasToken: repo.hasToken,
    itemCount: Object.keys(syncState.items).length,
    openIssues,
    openPulls,
    newIssuesToday,
    newPullsToday,
    lastSyncedAt: syncState.lastSyncedAt,
    lastActivityAt,
  }
}

export async function buildInitialPayload(ctx: ProjectContext): Promise<ProjectInitialPayload> {
  const [repo, syncState, queue, uiState, snapshot] = await Promise.all([
    buildRepoMeta(ctx),
    loadSyncState(ctx.storageDirAbsolute),
    buildQueueState({
      storageDirAbsolute: ctx.storageDirAbsolute,
      executeFilePath: ctx.executeFilePath,
    }),
    loadUiState(ctx.storageDirAbsolute),
    loadRepoSnapshot(ctx.storageDirAbsolute),
  ])

  const repositoryLabels = (snapshot?.labels ?? []).map(label => ({
    name: label.name,
    color: label.color,
    description: label.description,
  }))

  let currentUser: InitialPayload['currentUser'] = null
  const override = uiState.userOverride
  let fetched: InitialPayload['currentUser'] = null
  try {
    const provider = await ctx.getProvider()
    const user = await provider?.fetchAuthenticatedUser()
    if (user)
      fetched = { login: user.login, name: user.name, avatarUrl: user.avatarUrl }
  }
  catch {
    fetched = null
  }
  if (override || fetched) {
    const login = override?.login ?? fetched?.login
    if (login) {
      currentUser = {
        login,
        name: override?.name ?? fetched?.name ?? null,
        avatarUrl: override?.avatarUrl ?? fetched?.avatarUrl ?? `https://avatars.githubusercontent.com/${login}`,
      }
    }
  }

  return {
    projectId: ctx.id,
    repo,
    syncState,
    queue,
    remote: ctx.poller.getCurrent(),
    recentExecutions: syncState.executions ?? [],
    uiState,
    repositoryLabels,
    currentUser,
    bots: ctx.config.bots,
  }
}

export async function getPullPatch(ctx: ProjectContext, number: number): Promise<string | null> {
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

export async function openInEditor(ctx: ProjectContext, filePath: string): Promise<void> {
  const absolute = isAbsolute(filePath) ? filePath : resolve(ctx.storageDirAbsolute, filePath)
  const editor = process.env.EDITOR || process.env.VISUAL || 'code'
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(editor, [absolute], {
      stdio: 'ignore',
      detached: true,
    })
    child.on('error', rejectPromise)
    child.unref()
    resolvePromise()
  })
}

export async function triggerSync(ctx: ProjectContext, options: SyncTriggerOptions): Promise<SyncSummary> {
  if (syncRunning.has(ctx.id))
    throw diagnostics.GHFS0200()
  syncRunning.add(ctx.id)
  try {
    const token = await ctx.getToken()
    return await syncRepository({
      config: ctx.config,
      repo: ctx.repo,
      token,
      full: options.full,
      since: options.since,
      numbers: options.numbers,
      reporter: {
        onStageStart(event) {
          ctx.broadcast.onSyncStageStart({ stage: event.stage, message: event.message })
        },
        onStageUpdate(event) {
          ctx.broadcast.onSyncProgress({
            stage: event.stage,
            message: event.message,
            snapshot: event.snapshot,
          })
        },
        onStageEnd(event) {
          ctx.broadcast.onSyncStageEnd({ stage: event.stage, durationMs: event.durationMs })
        },
        onComplete(event) {
          ctx.broadcast.onSyncComplete(event.summary)
        },
        onError(event) {
          const message = event.error instanceof Error ? event.error.message : String(event.error)
          ctx.broadcast.onSyncError(message)
        },
      },
    })
  }
  finally {
    syncRunning.delete(ctx.id)
  }
}

export async function executeQueue(ctx: ProjectContext, options: ExecuteTriggerOptions): Promise<ExecutionResult> {
  if (executeRunning.has(ctx.id))
    throw diagnostics.GHFS0201()
  executeRunning.add(ctx.id)
  try {
    const token = await ctx.getToken()
    const selectedIndexes = await resolveSelectedIndexes(ctx, options.entryIds)
    ctx.broadcast.onExecuteStart({ planned: selectedIndexes?.length ?? -1 })
    const result = await executePendingChanges({
      config: ctx.config,
      repo: ctx.repo,
      token,
      executeFilePath: ctx.executeFilePath,
      apply: true,
      nonInteractive: true,
      continueOnError: options.continueOnError ?? true,
      selectedIndexes,
      reporter: {
        onStart(event) {
          ctx.broadcast.onExecuteStart({ planned: event.planned })
        },
        onProgress(event) {
          ctx.broadcast.onExecuteProgress({
            completed: event.completed,
            planned: event.planned,
            applied: event.applied,
            failed: event.failed,
            detail: event.detail,
          })
        },
        onComplete(event) {
          ctx.broadcast.onExecuteComplete(event.result)
        },
        onError(event) {
          const message = event.error instanceof Error ? event.error.message : String(event.error)
          ctx.broadcast.onExecuteError(message)
        },
      },
    })
    return result
  }
  finally {
    executeRunning.delete(ctx.id)
  }
}

async function resolveSelectedIndexes(
  ctx: ProjectContext,
  entryIds: string[] | undefined,
): Promise<number[] | undefined> {
  if (!entryIds || entryIds.length === 0)
    return undefined
  const queue = await buildQueueState({
    storageDirAbsolute: ctx.storageDirAbsolute,
    executeFilePath: ctx.executeFilePath,
  })
  const ids = new Set(entryIds)
  const indexes: number[] = []
  queue.entries.forEach((entry, globalIndex) => {
    if (ids.has(entry.id))
      indexes.push(globalIndex)
  })
  return indexes
}
