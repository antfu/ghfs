import type { ExecutionResult, SyncItemState, SyncState } from '../types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SYNC_STATE_FILE_NAME } from '../constants'

export function getSyncStatePath(storageDirAbsolute: string): string {
  return join(storageDirAbsolute, SYNC_STATE_FILE_NAME)
}

export async function loadSyncState(storageDirAbsolute: string): Promise<SyncState> {
  const path = getSyncStatePath(storageDirAbsolute)
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as {
      version?: number
      items?: Record<string, SyncItemState & { updatedAt?: string }>
      executions?: SyncState['executions']
      repo?: string
      lastSyncedAt?: string
      lastSince?: string
      lastSyncRun?: SyncState['lastSyncRun']
    }
    if (parsed.version !== 1)
      return createEmptySyncState()
    return {
      version: 1,
      items: normalizeItems(parsed.items, parsed.lastSyncedAt),
      executions: parsed.executions ?? [],
      repo: parsed.repo,
      lastSyncedAt: parsed.lastSyncedAt,
      lastSince: parsed.lastSince,
      lastSyncRun: normalizeLastSyncRun(parsed.lastSyncRun),
    }
  }
  catch {
    return createEmptySyncState()
  }
}

function normalizeItems(items: Record<string, SyncItemState & { updatedAt?: string }> | undefined, fallbackLastSyncedAt: string | undefined): SyncState['items'] {
  if (!items)
    return {}

  const normalized: SyncState['items'] = {}
  for (const [key, item] of Object.entries(items)) {
    const lastUpdatedAt = item.lastUpdatedAt ?? item.updatedAt
    if (!lastUpdatedAt)
      continue

    normalized[key] = {
      ...item,
      lastUpdatedAt,
      lastSyncedAt: item.lastSyncedAt ?? fallbackLastSyncedAt ?? lastUpdatedAt,
    }
  }

  return normalized
}

export async function saveSyncState(storageDirAbsolute: string, state: SyncState): Promise<void> {
  await mkdir(storageDirAbsolute, { recursive: true })
  const path = getSyncStatePath(storageDirAbsolute)
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function createEmptySyncState(): SyncState {
  return {
    version: 1,
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

function normalizeLastSyncRun(lastSyncRun: SyncState['lastSyncRun'] | undefined): SyncState['lastSyncRun'] {
  if (!lastSyncRun)
    return undefined
  if (!lastSyncRun.runId || !lastSyncRun.repo || !lastSyncRun.mode)
    return undefined
  return lastSyncRun
}
