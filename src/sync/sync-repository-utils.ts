import type { GhfsResolvedConfig, IssueKind, IssueState } from '../types'
import type { ProviderItem } from '../types/provider'
import type { PatchPlan, SyncCounters } from './sync-repository-types'
import { basename } from 'pathe'

export function createCounters(scanned = 0, selected = 0): SyncCounters {
  return {
    scanned,
    selected,
    processed: 0,
    skipped: 0,
    written: 0,
    moved: 0,
    patchesWritten: 0,
    patchesDeleted: 0,
  }
}

export function addItemStats(counters: SyncCounters, stats: Pick<SyncCounters, 'skipped' | 'written' | 'moved' | 'patchesWritten' | 'patchesDeleted'>): void {
  counters.skipped += stats.skipped
  counters.written += stats.written
  counters.moved += stats.moved
  counters.patchesWritten += stats.patchesWritten
  counters.patchesDeleted += stats.patchesDeleted
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

export function shouldSyncPrDetails(
  sync: GhfsResolvedConfig['sync'],
  kind: IssueKind,
  state: IssueState,
): boolean {
  if (kind === 'issue')
    return true
  return sync.patches === 'all' || (sync.patches === 'open' && state === 'open')
}

export function relativeToStorage(storageDirAbsolute: string, absolutePath: string): string {
  if (absolutePath.startsWith(storageDirAbsolute))
    return absolutePath.slice(storageDirAbsolute.length + 1)
  return basename(absolutePath)
}
