import type { SyncMode, SyncOptions, SyncProgressSnapshot, SyncStage, SyncSummary } from './contracts'
import type { IssueCandidates, SyncContext, SyncCounters } from './sync-repository-types'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { createRepositoryProvider } from '../providers/factory'
import { loadSyncState, saveSyncState } from './state'
import { syncIssueCandidate } from './sync-repository-item'
import { fetchIssueCandidatesByNumbers, fetchIssueCandidatesByPagination } from './sync-repository-provider'
import { writeRepositoryIndexes, writeRepoSnapshot } from './sync-repository-snapshot'
import { pruneMissingOpenTrackedItems, pruneTrackedClosedItems } from './sync-repository-storage'
import { addItemStats, createCounters, normalizeIssueNumbers, resolveSince, shouldSyncIssue } from './sync-repository-utils'

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
  let candidates: IssueCandidates = {
    issues: [],
    scanned: 0,
  }
  let issues: IssueCandidates['issues'] = []
  let mode: SyncMode = 'full'
  let since: string | undefined

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
    await runStage('resolve', 'Resolve sync context', async () => {
      const syncState = await loadSyncState(storageDirAbsolute)
      since = targetNumbers ? undefined : resolveSince(options, syncState)
      const syncedAt = new Date().toISOString()
      mode = targetNumbers
        ? 'targeted'
        : since
          ? 'incremental'
          : 'full'

      context = {
        provider,
        repoSlug: options.repo,
        storageDirAbsolute,
        config: options.config,
        syncState,
        syncedAt,
      }

      reporter?.onStageUpdate?.({
        stage: 'resolve',
        snapshot: cloneSnapshot(counters),
        message: [
          `mode=${mode}`,
          targetNumbers ? `numbers=${targetNumbers.length}` : `since=${since ?? '(full)'}`,
        ].join(' '),
      })
    })

    await runStage('fetch', 'Fetch issue and pull request candidates', async () => {
      assertContext(context)
      candidates = targetNumbers
        ? await fetchIssueCandidatesByNumbers(context, targetNumbers)
        : await fetchIssueCandidatesByPagination(context, since)
      counters.scanned = candidates.scanned

      reporter?.onStageUpdate?.({
        stage: 'fetch',
        snapshot: cloneSnapshot(counters),
        message: `scanned=${counters.scanned}`,
      })
    })

    await runStage('filter', 'Filter candidates by sync config', async () => {
      issues = candidates.issues.filter(issue => shouldSyncIssue(options.config.sync, issue))
      counters.selected = issues.length

      reporter?.onStageUpdate?.({
        stage: 'filter',
        snapshot: cloneSnapshot(counters),
        message: `selected=${counters.selected}`,
      })
    })

    await runStage('sync', 'Sync items', async () => {
      assertContext(context)
      for (const issue of issues) {
        addItemStats(counters, await syncIssueCandidate(context, issue))
        counters.processed += 1

        reporter?.onStageUpdate?.({
          stage: 'sync',
          snapshot: cloneSnapshot(counters),
          message: `#${issue.number} ${issue.kind} ${issue.state}`,
        })
      }
    })

    await runStage('prune', 'Prune stale local artifacts', async () => {
      assertContext(context)
      if (options.config.sync.closed === false) {
        counters.patchesDeleted += await pruneTrackedClosedItems(context.storageDirAbsolute, context.syncState, options.config.sync)
      }

      if (!targetNumbers && options.config.sync.closed === false && candidates.allOpenNumbers) {
        counters.patchesDeleted += await pruneMissingOpenTrackedItems(
          context.storageDirAbsolute,
          context.syncState,
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

    await runStage('save', 'Save sync state', async () => {
      assertContext(context)
      context.syncState.repo = options.repo
      if (!targetNumbers) {
        context.syncState.lastSyncedAt = context.syncedAt
        context.syncState.lastSince = since
      }

      await writeRepoSnapshot(context)
      await writeRepositoryIndexes(context)
      await saveSyncState(context.storageDirAbsolute, context.syncState)
    })

    assertContext(context)
    const finishedAt = new Date()
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime())

    const summary: SyncSummary = {
      repo: options.repo,
      mode,
      since,
      syncedAt: context.syncedAt,
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

    context.syncState.lastSyncRun = {
      runId,
      repo: options.repo,
      mode,
      startedAt: startedAtIso,
      finishedAt: finishedAt.toISOString(),
      durationMs,
      since,
      numbersCount: targetNumbers?.length,
      counters: cloneSnapshot(counters),
      stages: {
        ...stageDurations,
      },
    }

    await saveSyncState(context.storageDirAbsolute, context.syncState)

    reporter?.onComplete?.({
      summary,
      stages: {
        ...stageDurations,
      },
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
    throw new Error('Sync context was not initialized')
}

function createSyncRunId(): string {
  return `sync_${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomBytes(3).toString('hex')}`
}

function createStageDurations(): Record<SyncStage, number> {
  return {
    resolve: 0,
    fetch: 0,
    filter: 0,
    sync: 0,
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
