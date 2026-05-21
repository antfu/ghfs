import type { DevToolsNodeContext } from 'devframe'
import type { PendingOp } from '../execute/types'
import type { ExecuteTriggerOptions, InitialPayload, QueueState, RemoteStatus, RepoMeta, SyncTriggerOptions, UiState } from '../server/types'
import type { SyncSummary } from '../sync/contracts'
import type { ExecutionResult } from '../types/execution'
import type { SyncState } from '../types/sync-state'
import type { ProjectContext, ProjectRegistry } from './project-context'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { defineRpcFunction } from 'devframe'
import { isAbsolute, join, resolve } from 'pathe'
import { executePendingChanges } from '../execute'
import { CodedError, log } from '../logger'
import { GHFS_VERSION } from '../meta'
import { buildQueueState } from '../server/queue-builder'
import {
  addQueueOp as addQueueOpImpl,
  clearQueue as clearQueueImpl,
  removeQueueOp as removeQueueOpImpl,
  updateQueueOp as updateQueueOpImpl,
} from '../server/queue-writer'
import { loadUiState, saveUiState } from '../server/ui-state'
import { syncRepository } from '../sync'
import { computeProjectActivityBuckets } from '../sync/activity'
import { loadRepoSnapshot } from '../sync/repo-snapshot'
import { loadSyncState } from '../sync/state'
import { findProjectIcon } from '../utils/project-icon'

export interface ProjectSummary {
  id: string
  path: string
  name: string
  repo: string
  storageDir: string
  hasToken: boolean
  itemCount: number
  openIssues: number
  openPulls: number
  lastSyncedAt?: string
  /** Most recent `item.updatedAt` across the project's tracked items. */
  lastActivityAt?: string
}

export interface ProjectInitialPayload extends InitialPayload {
  projectId: string
}

function notFound(projectId: string): never {
  throw new CodedError(log.GHFS0206({ detail: `Project not found: ${projectId}` }))
}

function requireProject(registry: ProjectRegistry, projectId: string): ProjectContext {
  const ctx = registry.getProject(projectId)
  if (!ctx)
    notFound(projectId)
  return ctx
}

async function buildRepoMeta(ctx: ProjectContext): Promise<RepoMeta> {
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

async function summarizeProject(ctx: ProjectContext): Promise<ProjectSummary> {
  const [repo, syncState] = await Promise.all([
    buildRepoMeta(ctx),
    loadSyncState(ctx.storageDirAbsolute),
  ])
  let openIssues = 0
  let openPulls = 0
  let lastActivityAt: string | undefined
  for (const item of Object.values(syncState.items)) {
    const updatedAt = item.data.item.updatedAt
    if (updatedAt && (!lastActivityAt || updatedAt > lastActivityAt))
      lastActivityAt = updatedAt
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
    lastSyncedAt: syncState.lastSyncedAt,
    lastActivityAt,
  }
}

async function buildInitialPayload(ctx: ProjectContext): Promise<ProjectInitialPayload> {
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
  }
}

async function getPullPatch(ctx: ProjectContext, number: number): Promise<string | null> {
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

async function openInEditor(ctx: ProjectContext, filePath: string): Promise<void> {
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

const syncRunning = new Set<string>()
const executeRunning = new Set<string>()

async function triggerSync(ctx: ProjectContext, options: SyncTriggerOptions): Promise<SyncSummary> {
  if (syncRunning.has(ctx.id))
    throw new CodedError(log.GHFS0200())
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

async function executeQueue(ctx: ProjectContext, options: ExecuteTriggerOptions): Promise<ExecutionResult> {
  if (executeRunning.has(ctx.id))
    throw new CodedError(log.GHFS0201())
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

export interface RegisterProjectRpcOptions {
  /** Fires after `ghfs:save-ui-state` succeeds; used to react to settings changes. */
  onUiStateSaved?: (state: UiState, projectId: string) => void
}

/**
 * Register every per-project RPC function on the devframe context.
 * Functions are namespaced under `ghfs:` and take `projectId` as the
 * first argument so the same set works for ui and hub modes.
 */
export function registerProjectRpc(
  ctx: DevToolsNodeContext,
  registry: ProjectRegistry,
  options: RegisterProjectRpcOptions = {},
): void {
  const def = defineRpcFunction

  ctx.rpc.register(def({
    name: 'ghfs:capabilities',
    type: 'static',
    handler: async () => ({
      mode: registry.mode,
      ghfsVersion: GHFS_VERSION,
      projects: await Promise.all(registry.listProjects().map(summarizeProject)),
    }),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:list-projects',
    type: 'query',
    handler: async () => Promise.all(registry.listProjects().map(summarizeProject)),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:initial-payload',
    type: 'query',
    handler: async (projectId: string): Promise<ProjectInitialPayload> => buildInitialPayload(requireProject(registry, projectId)),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:sync-state',
    type: 'query',
    handler: async (projectId: string): Promise<SyncState> => loadSyncState(requireProject(registry, projectId).storageDirAbsolute),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:queue-state',
    type: 'query',
    handler: async (projectId: string): Promise<QueueState> => {
      const p = requireProject(registry, projectId)
      return buildQueueState({
        storageDirAbsolute: p.storageDirAbsolute,
        executeFilePath: p.executeFilePath,
      })
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:repo-meta',
    type: 'query',
    handler: async (projectId: string): Promise<RepoMeta> => buildRepoMeta(requireProject(registry, projectId)),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:trigger-sync',
    type: 'action',
    handler: async (projectId: string, options: SyncTriggerOptions): Promise<SyncSummary> => triggerSync(requireProject(registry, projectId), options ?? {}),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:execute-queue',
    type: 'action',
    handler: async (projectId: string, options: ExecuteTriggerOptions): Promise<ExecutionResult> => executeQueue(requireProject(registry, projectId), options ?? {}),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:add-queue-op',
    type: 'action',
    handler: async (projectId: string, op: PendingOp): Promise<QueueState> => {
      const p = requireProject(registry, projectId)
      return addQueueOpImpl({
        storageDirAbsolute: p.storageDirAbsolute,
        executeFilePath: p.executeFilePath,
      }, op)
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:update-queue-op',
    type: 'action',
    handler: async (projectId: string, id: string, op: PendingOp): Promise<QueueState> => {
      const p = requireProject(registry, projectId)
      return updateQueueOpImpl({
        storageDirAbsolute: p.storageDirAbsolute,
        executeFilePath: p.executeFilePath,
      }, id, op)
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:remove-queue-op',
    type: 'action',
    handler: async (projectId: string, id: string): Promise<QueueState> => {
      const p = requireProject(registry, projectId)
      return removeQueueOpImpl({
        storageDirAbsolute: p.storageDirAbsolute,
        executeFilePath: p.executeFilePath,
      }, id)
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:clear-queue',
    type: 'action',
    handler: async (projectId: string): Promise<QueueState> => {
      const p = requireProject(registry, projectId)
      return clearQueueImpl({
        storageDirAbsolute: p.storageDirAbsolute,
        executeFilePath: p.executeFilePath,
      })
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:check-remote',
    type: 'action',
    handler: async (projectId: string): Promise<RemoteStatus> => requireProject(registry, projectId).poller.checkNow(),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:open-in-editor',
    type: 'action',
    handler: async (projectId: string, filePath: string): Promise<void> => openInEditor(requireProject(registry, projectId), filePath),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:save-ui-state',
    type: 'action',
    handler: async (projectId: string, state: UiState): Promise<void> => {
      const p = requireProject(registry, projectId)
      await saveUiState(p.storageDirAbsolute, state)
      options.onUiStateSaved?.(state, projectId)
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:get-pull-patch',
    type: 'query',
    handler: async (projectId: string, number: number): Promise<string | null> => getPullPatch(requireProject(registry, projectId), number),
  }))

  ctx.rpc.register(def({
    name: 'ghfs:project-activity',
    type: 'query',
    handler: async (projectId: string, days?: number) => {
      const p = requireProject(registry, projectId)
      const state = await loadSyncState(p.storageDirAbsolute)
      return computeProjectActivityBuckets(state, days ?? 90)
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:hub-queue',
    type: 'query',
    handler: async () => {
      const out: { projectId: string, repo: string, queue: QueueState }[] = []
      for (const p of registry.listProjects()) {
        const queue = await buildQueueState({
          storageDirAbsolute: p.storageDirAbsolute,
          executeFilePath: p.executeFilePath,
        })
        out.push({ projectId: p.id, repo: p.repo, queue })
      }
      return out
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:hub-execute-queue',
    type: 'action',
    handler: async (options: { projectId?: string } | undefined): Promise<ExecutionResult[]> => {
      const projects = options?.projectId
        ? [requireProject(registry, options.projectId)]
        : registry.listProjects()
      const results: ExecutionResult[] = []
      for (const p of projects) {
        try {
          const r = await executeQueue(p, {})
          results.push(r)
        }
        catch {
          // Already broadcast via the per-project executor's onError; continue
          // running other projects so a single failure doesn't halt the batch.
        }
      }
      return results
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:hub-recent-items',
    type: 'query',
    handler: async (limit?: number) => {
      const cap = typeof limit === 'number' && limit > 0 ? Math.min(limit, 500) : 100
      const collected: {
        projectId: string
        repo: string
        kind: 'issue' | 'pull'
        number: number
        title: string
        state: 'open' | 'closed'
        updatedAt: string
        author: string | null
        labels: string[]
      }[] = []
      for (const p of registry.listProjects()) {
        const state = await loadSyncState(p.storageDirAbsolute)
        for (const item of Object.values(state.items)) {
          collected.push({
            projectId: p.id,
            repo: p.repo,
            kind: item.kind,
            number: item.number,
            title: item.data.item.title,
            state: item.state,
            updatedAt: item.data.item.updatedAt,
            author: item.data.item.author,
            labels: item.data.item.labels ?? [],
          })
        }
      }
      collected.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return collected.slice(0, cap)
    },
  }))

  ctx.rpc.register(def({
    name: 'ghfs:get-project-icon',
    type: 'query',
    handler: async (projectId: string): Promise<string | null> => findProjectIcon(requireProject(registry, projectId).path),
  }))
}

/**
 * Event names broadcast from the server to all clients. Each payload is
 * `{ projectId, ...event }` so the client can route updates to the
 * right project bucket.
 */
export const PROJECT_EVENT_NAMES = [
  'ghfs:onSyncStageStart',
  'ghfs:onSyncProgress',
  'ghfs:onSyncStageEnd',
  'ghfs:onSyncComplete',
  'ghfs:onSyncError',
  'ghfs:onExecuteStart',
  'ghfs:onExecuteProgress',
  'ghfs:onExecuteComplete',
  'ghfs:onExecuteError',
  'ghfs:onSyncStateChange',
  'ghfs:onQueueChange',
  'ghfs:onRemoteStatusChange',
] as const

export type ProjectEventName = typeof PROJECT_EVENT_NAMES[number]
