import type { ExecutionResult, SyncItemState, SyncState } from '../types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { SYNC_STATE_FILE_NAME } from '../constants'
import { GHFS_VERSION } from '../meta'
import { normalizeReactions } from '../utils/reactions'

export function getSyncStatePath(storageDirAbsolute: string): string {
  return join(storageDirAbsolute, SYNC_STATE_FILE_NAME)
}

export async function loadSyncState(storageDirAbsolute: string): Promise<SyncState> {
  const path = getSyncStatePath(storageDirAbsolute)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<SyncState>
    if (parsed.version !== 2)
      return createEmptySyncState()

    const items = normalizeItems(parsed.items)
    const executions = normalizeExecutions(parsed.executions)

    return {
      version: 2,
      items,
      executions,
      ghfsVersion: typeof parsed.ghfsVersion === 'string' ? parsed.ghfsVersion : undefined,
      repo: parsed.repo,
      lastSyncedAt: parsed.lastSyncedAt,
      lastSince: parsed.lastSince,
      lastRepoUpdatedAt: parsed.lastRepoUpdatedAt,
      lastSyncRun: parsed.lastSyncRun,
    }
  }
  catch {
    return createEmptySyncState()
  }
}

function normalizeItems(items: unknown): SyncState['items'] {
  if (!items)
    return {}

  if (typeof items !== 'object' || Array.isArray(items))
    return {}

  const normalizedItems: SyncState['items'] = {}
  for (const [key, item] of Object.entries(items as Record<string, SyncItemState>)) {
    const normalizedItem = normalizeItem(item)
    if (!normalizedItem)
      continue
    normalizedItems[key] = normalizedItem
  }

  return normalizedItems
}

function normalizeExecutions(executions: unknown): SyncState['executions'] {
  if (!Array.isArray(executions))
    return []

  return executions.map((execution) => {
    if (!execution || typeof execution !== 'object')
      return execution

    const typedExecution = execution as Record<string, unknown>
    if (typedExecution.mode === 'dry-run')
      return { ...typedExecution, mode: 'report' } as ExecutionResult

    return typedExecution as unknown as ExecutionResult
  }) as SyncState['executions']
}

export async function saveSyncState(storageDirAbsolute: string, state: SyncState): Promise<void> {
  await mkdir(storageDirAbsolute, { recursive: true })
  const normalizedState: SyncState = {
    ...state,
    ghfsVersion: state.ghfsVersion ?? GHFS_VERSION,
  }
  const path = getSyncStatePath(storageDirAbsolute)
  await writeFile(path, `${JSON.stringify(normalizedState, null, 2)}\n`, 'utf8')
}

export function createEmptySyncState(): SyncState {
  return {
    version: 2,
    items: {},
    executions: [],
  }
}

export function appendExecution(state: SyncState, result: ExecutionResult, limit = 20): SyncState {
  const nextExecutions = [result, ...state.executions].slice(0, limit)
  return {
    ...state,
    executions: nextExecutions,
  }
}

function normalizeItem(item: SyncItemState | undefined): SyncItemState | undefined {
  if (!item || typeof item !== 'object')
    return undefined
  if (!item.lastUpdatedAt || !item.lastSyncedAt || !item.filePath)
    return undefined
  if (!item.data || !item.data.item)
    return undefined
  const comments = Array.isArray(item.data.comments) ? item.data.comments : []

  return {
    ...item,
    data: {
      ...item.data,
      item: {
        ...item.data.item,
        reactions: normalizeReactions(item.data.item.reactions),
      },
      comments: comments
        .filter(comment => comment && typeof comment === 'object')
        .map(comment => ({
          ...comment,
          reactions: normalizeReactions(comment.reactions),
        })),
    },
  }
}
