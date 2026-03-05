import type { SyncOptions, SyncSummary } from './contracts'
import type { SyncContext } from './sync-repository-types'
import { resolve } from 'node:path'
import { createRepositoryProvider } from '../providers/factory'
import { loadSyncState, saveSyncState } from './state'
import { syncIssueCandidate } from './sync-repository-item'
import { fetchIssueCandidatesByNumbers, fetchIssueCandidatesByPagination } from './sync-repository-provider'
import { writeRepositoryIndexes, writeRepoSnapshot } from './sync-repository-snapshot'
import { pruneMissingOpenTrackedItems, pruneTrackedClosedItems } from './sync-repository-storage'
import { addItemStats, createCounters, normalizeIssueNumbers, resolveSince, shouldSyncIssue } from './sync-repository-utils'

export async function syncRepository(options: SyncOptions): Promise<SyncSummary> {
  const provider = options.provider ?? createRepositoryProvider({
    token: options.token,
    repo: options.repo,
  })
  const storageDirAbsolute = resolve(options.config.cwd, options.config.directory)
  const targetNumbers = normalizeIssueNumbers(options.numbers)

  const syncState = await loadSyncState(storageDirAbsolute)
  const since = targetNumbers ? undefined : resolveSince(options, syncState)
  const syncedAt = new Date().toISOString()

  const context: SyncContext = {
    provider,
    repoSlug: options.repo,
    storageDirAbsolute,
    config: options.config,
    syncState,
    syncedAt,
  }

  await writeRepoSnapshot(context)

  const candidates = targetNumbers
    ? await fetchIssueCandidatesByNumbers(context, targetNumbers)
    : await fetchIssueCandidatesByPagination(context, since)

  const issues = candidates.issues.filter(issue => shouldSyncIssue(options.config.sync, issue))
  const counters = createCounters(issues.length)

  if (options.config.sync.closed === false)
    counters.patchesDeleted += await pruneTrackedClosedItems(storageDirAbsolute, syncState, options.config.sync)

  for (const issue of issues)
    addItemStats(counters, await syncIssueCandidate(context, issue))

  if (!targetNumbers && options.config.sync.closed === false && candidates.allOpenNumbers) {
    counters.patchesDeleted += await pruneMissingOpenTrackedItems(
      storageDirAbsolute,
      syncState,
      candidates.allOpenNumbers,
      options.config.sync,
    )
  }

  syncState.repo = options.repo
  if (!targetNumbers) {
    syncState.lastSyncedAt = syncedAt
    syncState.lastSince = since
  }

  await writeRepositoryIndexes(context)
  await saveSyncState(storageDirAbsolute, syncState)

  return {
    repo: options.repo,
    since,
    syncedAt,
    scanned: counters.scanned,
    written: counters.written,
    moved: counters.moved,
    patchesWritten: counters.patchesWritten,
    patchesDeleted: counters.patchesDeleted,
  }
}
