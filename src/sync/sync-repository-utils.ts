import type { GhfsResolvedConfig, IssueKind, IssueState, SyncState } from '../types'
import type { ProviderItem } from '../types/provider'
import type { SyncOptions } from './contracts'
import type { PatchPlan, SyncCounters } from './sync-repository-types'
import { basename } from 'node:path'

export function resolveSince(options: SyncOptions, syncState: SyncState): string | undefined {
  if (options.full)
    return undefined
  if (options.since)
    return options.since
  return syncState.lastSyncedAt
}

export function normalizeIssueNumbers(numbers: number[] | undefined): number[] | undefined {
  if (!numbers)
    return undefined
  return [...new Set(numbers.filter(number => Number.isInteger(number) && number > 0))]
}

export function createCounters(scanned: number): SyncCounters {
  return {
    scanned,
    written: 0,
    moved: 0,
    patchesWritten: 0,
    patchesDeleted: 0,
  }
}

export function addItemStats(counters: SyncCounters, stats: Pick<SyncCounters, 'written' | 'moved' | 'patchesWritten' | 'patchesDeleted'>): void {
  counters.written += stats.written
  counters.moved += stats.moved
  counters.patchesWritten += stats.patchesWritten
  counters.patchesDeleted += stats.patchesDeleted
}

export function resolvePaginateState(closedMode: GhfsResolvedConfig['sync']['closed']): 'open' | 'all' {
  return closedMode === false ? 'open' : 'all'
}

export function shouldSyncKind(sync: GhfsResolvedConfig['sync'], kind: IssueKind): boolean {
  return kind === 'issue' ? sync.issues : sync.pulls
}

export function shouldSyncIssue(sync: GhfsResolvedConfig['sync'], issue: ProviderItem): boolean {
  return shouldSyncKind(sync, issue.kind)
}

export function resolvePatchPlan(patchesMode: GhfsResolvedConfig['sync']['patches'], kind: IssueKind, state: IssueState): PatchPlan {
  if (kind !== 'pull') {
    return {
      shouldWritePatch: false,
      shouldDeletePatch: false,
    }
  }

  const shouldWritePatch = patchesMode === 'all' || (patchesMode === 'open' && state === 'open')
  return {
    shouldWritePatch,
    shouldDeletePatch: !shouldWritePatch,
  }
}

export function relativeToStorage(storageDirAbsolute: string, absolutePath: string): string {
  if (absolutePath.startsWith(storageDirAbsolute))
    return absolutePath.slice(storageDirAbsolute.length + 1)
  return basename(absolutePath)
}
