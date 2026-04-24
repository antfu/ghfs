import type { SyncOptions, SyncProgressSnapshot, SyncStage, SyncSummary } from './contracts'
import type { IssueCandidates, PreparedIssueCandidate, SyncContext, SyncCounters } from './sync-repository-types'
import { randomBytes } from 'node:crypto'
import { resolve } from 'pathe'
import { CodedError, log } from '../logger'
import { GHFS_VERSION } from '../meta'
import { createRepositoryProvider } from '../providers/factory'
import { formatIssueNumber } from '../utils/format'
import { normalizeIssueNumbers, resolveSince } from '../utils/sync'
import { loadSyncState, saveSyncState } from './state'
import {
  materializePreparedIssue,
  prepareIssueCandidateSync,
  reconcileMarkdownFilesByScan,
  rematerializeTrackedMarkdown,
} from './sync-repository-item'
import { fetchIssueCandidatesByNumbers, fetchIssueCandidatesByPagination } from './sync-repository-provider'
import { writeRepositoryIndexes, writeRepoSnapshot } from './sync-repository-snapshot'
import { pruneMissingOpenTrackedItems, pruneTrackedClosedItems } from './sync-repository-storage'
import { addItemStats, createCounters } from './sync-repository-utils'

export async function syncRepository(options: SyncOptions): Promise<SyncSummary> {
  const reporter = options.reporter
  const startedAt = new Date()
  const startedAtIso = startedAt.toISOString()
  const runId = createSyncRunId()
  const provider = options.provider ?? createRepositoryProvider({
    token: options.token,
    repo: options.repo,
  })
  const storageDirAbsolute = resolve(options.config.cwd, options.config.directory)
  const targetNumbers = normalizeIssueNumbers(options.numbers)
  const counters = createCounters()
  const stageDurations = createStageDurations()
  let errorReported = false

  reporter?.onStart?.({
    repo: options.repo,
    startedAt: startedAtIso,
    numbersCount: targetNumbers?.length,
    snapshot: cloneSnapshot(counters),
  })

  let context: SyncContext | undefined
  let since: string | undefined
  let repoUpdatedAt: string | undefined
  let candidates: IssueCandidates = { issues: [], scanned: 0 }
  const preparedCandidates: PreparedIssueCandidate[] = []
  let updatedIssues = 0
  let updatedPulls = 0
  let ghfsVersionMismatch = false
  let previousGhfsVersion: string | undefined

  const runStage = async <T>(stage: SyncStage, message: string, fn: () => Promise<T>): Promise<T> => {
    reporter?.onStageStart?.({
      stage,
      message,
      snapshot: cloneSnapshot(counters),
    })
    const stageStartedAt = Date.now()
    try {
      const result = await fn()
      const durationMs = Date.now() - stageStartedAt
      stageDurations[stage] = durationMs
      reporter?.onStageEnd?.({
        stage,
        message,
        durationMs,
        snapshot: cloneSnapshot(counters),
      })
      return result
    }
    catch (error) {
      errorReported = true
      stageDurations[stage] = Date.now() - stageStartedAt
      reporter?.onError?.({
        stage,
        error,
        snapshot: cloneSnapshot(counters),
      })
      throw error
    }
  }

  try {
    let shouldEarlyReturn = false

    await runStage('metadata', 'Fetch repository metadata', async () => {
      const syncState = await loadSyncState(storageDirAbsolute)
      since = targetNumbers ? undefined : resolveSince(options, syncState)
      const syncedAt = new Date().toISOString()

      context = {
        provider,
        repoSlug: options.repo,
        storageDirAbsolute,
        config: options.config,
        syncState,
        syncedAt,
        totalIssues: 0,
        totalPulls: 0,
      }
      previousGhfsVersion = syncState.ghfsVersion
      ghfsVersionMismatch = syncState.ghfsVersion !== GHFS_VERSION

      if (targetNumbers)
        return

      const repository = await provider.fetchRepository()
      repoUpdatedAt = repository.updated_at
      if (!options.full && syncState.lastRepoUpdatedAt && syncState.lastRepoUpdatedAt === repoUpdatedAt)
        shouldEarlyReturn = true

      reporter?.onStageUpdate?.({
        stage: 'metadata',
        snapshot: cloneSnapshot(counters),
        message: `since=${since ?? '(full)'} repoUpdatedAt=${repoUpdatedAt}`,
      })
    })

    assertContext(context)
    const syncContext = context

    if (!shouldEarlyReturn) {
      await runStage('pagination', 'Pagination', async () => {
        const paginatedSince = options.full ? undefined : since
        candidates = targetNumbers
          ? await fetchIssueCandidatesByNumbers(syncContext, targetNumbers)
          : await fetchIssueCandidatesByPagination(syncContext, paginatedSince)
        counters.scanned = candidates.scanned
        counters.selected = candidates.issues.length

        reporter?.onStageUpdate?.({
          stage: 'pagination',
          snapshot: cloneSnapshot(counters),
          message: `scanned=${counters.scanned} selected=${counters.selected}`,
        })
      })

      await runStage('fetch', 'Fetch updated issues/PRs', async () => {
        for (const issue of candidates.issues) {
          const prepared = await prepareIssueCandidateSync(syncContext, issue)
          preparedCandidates.push(prepared)
          counters.processed += 1
          if (prepared.action === 'refetch' || prepared.action === 'create') {
            if (prepared.kind === 'issue')
              updatedIssues += 1
            else
              updatedPulls += 1
          }

          reporter?.onStageUpdate?.({
            stage: 'fetch',
            snapshot: cloneSnapshot(counters),
            message: `${formatIssueNumber(issue.number, { repo: options.repo, kind: issue.kind })} ${prepared.kind} ${prepared.action}`,
          })
        }
      })

      syncContext.syncState.repo = options.repo
      if (!targetNumbers) {
        syncContext.syncState.lastSyncedAt = syncContext.syncedAt
        syncContext.syncState.lastSince = since
        syncContext.syncState.lastRepoUpdatedAt = repoUpdatedAt
      }
      await saveSyncState(syncContext.storageDirAbsolute, syncContext.syncState)

      await runStage('materialize', 'Materialize local files', async () => {
        for (const prepared of preparedCandidates)
          addItemStats(counters, await materializePreparedIssue(syncContext, prepared))
      })

      await runStage('prune', 'Prune stale local artifacts', async () => {
        if (options.config.sync.closed === false) {
          counters.patchesDeleted += await pruneTrackedClosedItems(syncContext.storageDirAbsolute, syncContext.syncState, options.config.sync)
        }

        if (!targetNumbers && options.config.sync.closed === false && candidates.allOpenNumbers) {
          counters.patchesDeleted += await pruneMissingOpenTrackedItems(
            syncContext.storageDirAbsolute,
            syncContext.syncState,
            candidates.allOpenNumbers,
            options.config.sync,
          )
        }

        reporter?.onStageUpdate?.({
          stage: 'prune',
          snapshot: cloneSnapshot(counters),
          message: `patchesDeleted=${counters.patchesDeleted}`,
        })
      })
    }

    await runStage('save', 'Save sync state', async () => {
      if (ghfsVersionMismatch) {
        const rematerialized = await rematerializeTrackedMarkdown(syncContext)
        reporter?.onStageUpdate?.({
          stage: 'save',
          snapshot: cloneSnapshot(counters),
          message: `regenerated=${rematerialized.written} version=${previousGhfsVersion ?? '(none)'}->${GHFS_VERSION}`,
        })
      }

      const scanStats = await reconcileMarkdownFilesByScan(syncContext)
      counters.written += scanStats.written
      counters.moved += scanStats.moved
      reporter?.onStageUpdate?.({
        stage: 'save',
        snapshot: cloneSnapshot(counters),
        message: `scan-fixed written=${scanStats.written} moved=${scanStats.moved}`,
      })

      if (!shouldEarlyReturn)
        await writeRepoSnapshot(syncContext)

      if (!shouldEarlyReturn || ghfsVersionMismatch)
        await writeRepositoryIndexes(syncContext)

      syncContext.syncState.ghfsVersion = GHFS_VERSION
      await saveSyncState(syncContext.storageDirAbsolute, syncContext.syncState)
    })

    const totals = computeTotals(syncContext.syncState.items)
    syncContext.totalIssues = totals.totalIssues
    syncContext.totalPulls = totals.totalPulls

    const finishedAt = new Date()
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime())
    const requestCount = provider.getRequestCount()

    const summary: SyncSummary = {
      repo: options.repo,
      since,
      syncedAt: syncContext.syncedAt,
      totalIssues: totals.totalIssues,
      totalPulls: totals.totalPulls,
      updatedIssues,
      updatedPulls,
      trackedItems: totals.trackedItems,
      requestCount,
      scanned: counters.scanned,
      selected: counters.selected,
      processed: counters.processed,
      skipped: counters.skipped,
      written: counters.written,
      moved: counters.moved,
      patchesWritten: counters.patchesWritten,
      patchesDeleted: counters.patchesDeleted,
      durationMs,
    }

    syncContext.syncState.lastSyncRun = {
      runId,
      repo: options.repo,
      startedAt: startedAtIso,
      finishedAt: finishedAt.toISOString(),
      durationMs,
      requestCount,
      since,
      numbersCount: targetNumbers?.length,
      counters: cloneSnapshot(counters),
      stages: { ...stageDurations },
    }

    await saveSyncState(syncContext.storageDirAbsolute, syncContext.syncState)

    reporter?.onComplete?.({
      summary,
      stages: { ...stageDurations },
    })

    return summary
  }
  catch (error) {
    if (!errorReported) {
      reporter?.onError?.({
        error,
        snapshot: cloneSnapshot(counters),
      })
    }
    throw error
  }
}

function assertContext(context: SyncContext | undefined): asserts context is SyncContext {
  if (!context)
    throw new CodedError(log.GHFS0400())
}

function createSyncRunId(): string {
  return `sync_${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomBytes(3).toString('hex')}`
}

function createStageDurations(): Record<SyncStage, number> {
  return {
    metadata: 0,
    pagination: 0,
    fetch: 0,
    materialize: 0,
    prune: 0,
    save: 0,
  }
}

function cloneSnapshot(counters: SyncCounters): SyncProgressSnapshot {
  return {
    scanned: counters.scanned,
    selected: counters.selected,
    processed: counters.processed,
    skipped: counters.skipped,
    written: counters.written,
    moved: counters.moved,
    patchesWritten: counters.patchesWritten,
    patchesDeleted: counters.patchesDeleted,
  }
}

function computeTotals(items: SyncContext['syncState']['items']): {
  totalIssues: number
  totalPulls: number
  trackedItems: number
} {
  let totalIssues = 0
  let totalPulls = 0
  for (const item of Object.values(items)) {
    if (item.kind === 'issue')
      totalIssues += 1
    else
      totalPulls += 1
  }
  return {
    totalIssues,
    totalPulls,
    trackedItems: totalIssues + totalPulls,
  }
}
