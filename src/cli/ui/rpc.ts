import type { ExecuteReporter } from '../../execute'
import type { ActionName } from '../../execute/actions'
import type { ExecuteSourceEntry } from '../../execute/sources/types'
import type { PendingOp } from '../../execute/types'
import type { ExecutionResult, GhfsResolvedConfig, SyncItemState } from '../../types'
import type {
  ServerFunctions,
  UiBootstrap,
  UiExecuteProgressEvent,
  UiItemDetail,
  UiItemEdits,
  UiQueueEntry,
} from './contracts'
import { readFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import { resolveAuthToken } from '../../config/auth'
import { resolveRepo } from '../../config/repo'
import { REPO_SNAPSHOT_FILE_NAME } from '../../constants'
import { executePendingChanges } from '../../execute'
import { computeExecuteDiffOps, normalizeMilestone, normalizeStringArray } from '../../execute/diff'
import { loadExecuteSources } from '../../execute/sources'
import { readAndValidateExecuteFileWithSource, writeExecuteFile } from '../../execute/validate'
import { appendExecutionResult, syncRepository } from '../../sync'
import { loadSyncState } from '../../sync/state'
import { pathExists } from '../../utils/fs'
import { describeCliOperation } from '../action-color'

const REPLACEABLE_FAMILIES = new Set<QueueActionFamily>([
  'title',
  'body',
  'state',
  'labels',
  'assignees',
  'milestone',
  'reviewers',
  'draft',
])

type QueueActionFamily
  = | 'title'
    | 'body'
    | 'state'
    | 'labels'
    | 'assignees'
    | 'milestone'
    | 'reviewers'
    | 'draft'
    | 'comment'
    | 'other'

export interface CreateServerFunctionsOptions {
  config: GhfsResolvedConfig
  executeFilePath: string
  storageDirAbsolute: string
  onStateChanged?: (bootstrap: UiBootstrap) => Promise<void> | void
  onExecuteProgress?: (event: UiExecuteProgressEvent) => Promise<void> | void
  onExecuteComplete?: (result: ExecutionResult) => Promise<void> | void
  resolveRepo?: typeof resolveRepo
  resolveAuthToken?: typeof resolveAuthToken
  executePendingChanges?: typeof executePendingChanges
  appendExecutionResult?: typeof appendExecutionResult
  syncRepository?: typeof syncRepository
  loadExecuteSources?: typeof loadExecuteSources
}

export function createServerFunctions(options: CreateServerFunctionsOptions): ServerFunctions {
  const resolveRepoFn = options.resolveRepo ?? resolveRepo
  const resolveAuthTokenFn = options.resolveAuthToken ?? resolveAuthToken
  const executePendingChangesFn = options.executePendingChanges ?? executePendingChanges
  const appendExecutionResultFn = options.appendExecutionResult ?? appendExecutionResult
  const syncRepositoryFn = options.syncRepository ?? syncRepository
  const loadExecuteSourcesFn = options.loadExecuteSources ?? loadExecuteSources

  let executing = false

  async function getBootstrap(): Promise<UiBootstrap> {
    const syncState = await loadSyncState(options.storageDirAbsolute)
    const loaded = await loadExecuteSourcesFn(options.executeFilePath)

    const items = Object.values(syncState.items)
      .map((entry) => {
        const item = entry.data.item
        return {
          number: entry.number,
          kind: entry.kind,
          state: entry.state,
          title: item.title,
          updatedAt: item.updatedAt,
          createdAt: item.createdAt,
          closedAt: item.closedAt,
          author: item.author,
          url: item.url,
          labels: item.labels,
          assignees: item.assignees,
          milestone: item.milestone,
          commentsCount: entry.data.comments.length,
          isDraft: entry.data.pull?.isDraft,
          merged: entry.data.pull?.merged,
          requestedReviewers: entry.data.pull?.requestedReviewers ?? [],
        }
      })
      .sort((left, right) => right.number - left.number)

    const queue = toQueueEntries(loaded.entries, syncState.repo)
    const openCount = items.filter(item => item.state === 'open').length

    return {
      repo: syncState.repo,
      syncedAt: syncState.lastSyncedAt,
      lastSyncRunAt: syncState.lastSyncRun?.finishedAt,
      totalTracked: items.length,
      openCount,
      closedCount: items.length - openCount,
      warnings: loaded.warnings,
      items,
      queue,
      queueSummary: {
        total: queue.length,
        executeYml: queue.filter(entry => entry.source === 'execute.yml').length,
        executeMd: queue.filter(entry => entry.source === 'execute.md').length,
        perItem: queue.filter(entry => entry.source === 'per-item').length,
      },
    }
  }

  async function getItemDetail(number: number): Promise<UiItemDetail> {
    const [syncState, repoSnapshot, loaded, yml] = await Promise.all([
      loadSyncState(options.storageDirAbsolute),
      readRepoSnapshot(options.storageDirAbsolute),
      loadExecuteSourcesFn(options.executeFilePath),
      readAndValidateExecuteFileWithSource(options.executeFilePath),
    ])

    const tracked = syncState.items[String(number)]
    if (!tracked)
      throw new Error(`Item #${number} is not available in local mirror`)

    const queue = toQueueEntries(loaded.entries, syncState.repo)
      .filter(entry => entry.op.number === number)

    const queuedYmlOps = yml.ops.filter(op => op.number === number)
    const effective = applyQueuedYmlOpsToItem(tracked, queuedYmlOps)

    return {
      number: tracked.number,
      kind: tracked.kind,
      state: effective.state,
      title: effective.title,
      body: effective.body,
      updatedAt: tracked.data.item.updatedAt,
      createdAt: tracked.data.item.createdAt,
      closedAt: tracked.data.item.closedAt,
      author: tracked.data.item.author,
      url: tracked.data.item.url,
      labels: effective.labels,
      assignees: effective.assignees,
      milestone: effective.milestone,
      commentsCount: tracked.data.comments.length,
      comments: tracked.data.comments.map(comment => ({
        id: comment.id,
        author: comment.author,
        body: comment.body || '',
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
      isDraft: effective.isDraft,
      merged: tracked.data.pull?.merged,
      requestedReviewers: effective.reviewers,
      labelsCatalog: repoSnapshot?.labels ?? [],
      milestonesCatalog: (repoSnapshot?.milestones ?? []).map(m => ({
        number: m.number,
        title: m.title,
        state: m.state,
      })),
      queue,
    }
  }

  async function queueItemEdits(payload: UiItemEdits): Promise<UiBootstrap> {
    const syncState = await loadSyncState(options.storageDirAbsolute)
    const tracked = syncState.items[String(payload.number)]
    if (!tracked)
      throw new Error(`Item #${payload.number} is not available in local mirror`)

    const nextOps = toQueuedOps(tracked, payload)
    const yml = await readAndValidateExecuteFileWithSource(options.executeFilePath)

    const filteredOps: Array<PendingOp & { _actionInput: string }> = []
    for (const [index, op] of yml.ops.entries()) {
      const family = getActionFamily(op.action)
      if (op.number === payload.number && REPLACEABLE_FAMILIES.has(family))
        continue

      filteredOps.push({
        ...op,
        _actionInput: yml.sourceActions[index] ?? op.action,
      })
    }

    const writable = [
      ...filteredOps.map(({ _actionInput, ...op }) => ({
        ...op,
        action: _actionInput,
      })),
      ...nextOps.map(op => ({
        ...op,
        action: op.action,
      })),
    ]

    await writeExecuteFile(options.executeFilePath, writable)
    return await notifyAndGetBootstrap(options.onStateChanged, getBootstrap)
  }

  async function removeQueueYmlEntry(index: number): Promise<UiBootstrap> {
    const yml = await readAndValidateExecuteFileWithSource(options.executeFilePath)
    if (!Number.isInteger(index) || index < 0 || index >= yml.ops.length)
      throw new Error(`Invalid execute.yml index: ${index}`)

    const writable = yml.ops
      .map((op, opIndex) => ({
        ...op,
        action: yml.sourceActions[opIndex] ?? op.action,
      }))
      .filter((_, opIndex) => opIndex !== index)

    await writeExecuteFile(options.executeFilePath, writable)
    return await notifyAndGetBootstrap(options.onStateChanged, getBootstrap)
  }

  async function refresh(): Promise<UiBootstrap> {
    return await notifyAndGetBootstrap(options.onStateChanged, getBootstrap)
  }

  async function executeNow() {
    if (executing)
      throw new Error('Execution is already in progress')

    executing = true
    try {
      const resolvedRepo = await resolveRepoFn({
        cwd: options.config.cwd,
        configRepo: options.config.repo,
        interactive: false,
      })

      const token = await resolveAuthTokenFn({
        token: options.config.auth.token,
        interactive: false,
      })

      const reporter: ExecuteReporter = {
        onStart: (event) => {
          fireAndForget(options.onExecuteProgress, {
            type: 'start',
            planned: event.planned,
            repo: event.repo,
          })
        },
        onProgress: (event) => {
          fireAndForget(options.onExecuteProgress, {
            type: 'progress',
            repo: event.repo,
            planned: event.planned,
            completed: event.completed,
            applied: event.applied,
            failed: event.failed,
            detail: event.detail,
          })
        },
        onError: (event) => {
          fireAndForget(options.onExecuteProgress, {
            type: 'error',
            message: toErrorMessage(event.error),
          })
        },
      }

      const result = await executePendingChangesFn({
        config: options.config,
        repo: resolvedRepo.repo,
        token,
        executeFilePath: options.executeFilePath,
        apply: true,
        nonInteractive: true,
        continueOnError: false,
        reporter,
      })

      await appendExecutionResultFn(options.storageDirAbsolute, result)

      const affectedNumbers = [...new Set(
        result.details
          .filter(detail => detail.status === 'applied')
          .map(detail => detail.number),
      )]

      if (affectedNumbers.length > 0) {
        await syncRepositoryFn({
          config: options.config,
          repo: resolvedRepo.repo,
          token,
          numbers: affectedNumbers,
        })
      }

      await options.onExecuteComplete?.(result)
      const bootstrap = await notifyAndGetBootstrap(options.onStateChanged, getBootstrap)
      return { result, bootstrap }
    }
    finally {
      executing = false
    }
  }

  return {
    getBootstrap,
    getItemDetail,
    queueItemEdits,
    removeQueueYmlEntry,
    refresh,
    executeNow,
  }
}

function toQueueEntries(entries: ExecuteSourceEntry[], repo?: string): UiQueueEntry[] {
  return entries.map(entry => ({
    id: `${entry.source}:${entry.sourceIndex}:${entry.mergedIndex}`,
    mergedIndex: entry.mergedIndex,
    source: entry.source,
    sourceIndex: entry.sourceIndex,
    editable: entry.source === 'execute.yml',
    op: entry.op,
    description: describeCliOperation(entry.op, {
      tty: false,
      repo,
    }),
  }))
}

function toQueuedOps(
  tracked: NonNullable<Awaited<ReturnType<typeof loadSyncState>>['items'][string]>,
  payload: UiItemEdits,
): PendingOp[] {
  const current = tracked.data.item
  const reviewersCurrent = tracked.data.pull?.requestedReviewers ?? []

  const desiredLabels = normalizeStringArray(payload.labels)
  const desiredAssignees = normalizeStringArray(payload.assignees)
  const desiredReviewers = normalizeStringArray(payload.reviewers)
  const desiredMilestone = normalizeMilestone(payload.milestone)
  const desiredTitle = payload.title.trim() || current.title
  const desiredBody = payload.body.trim().length > 0 ? payload.body : current.body || ''
  const desiredState = payload.state
  const desiredDraft = tracked.kind === 'pull'
    ? Boolean(payload.isDraft)
    : tracked.data.pull?.isDraft

  const ops = computeExecuteDiffOps({
    number: tracked.number,
    current: {
      title: current.title,
      body: current.body,
      state: current.state,
      labels: current.labels,
      assignees: current.assignees,
      milestone: current.milestone,
      reviewers: reviewersCurrent,
      isDraft: tracked.data.pull?.isDraft,
    },
    desired: {
      title: desiredTitle,
      body: desiredBody,
      state: desiredState,
      labels: desiredLabels,
      assignees: desiredAssignees,
      milestone: desiredMilestone,
      reviewers: tracked.kind === 'pull' ? desiredReviewers : reviewersCurrent,
      isDraft: desiredDraft,
    },
    ifUnchangedSince: current.updatedAt,
    includeBody: true,
  })

  const comment = payload.comment.trim()
  if (comment) {
    ops.push({
      action: 'add-comment',
      number: tracked.number,
      body: comment,
    })
  }

  return ops
}

function applyQueuedYmlOpsToItem(tracked: SyncItemState, ops: PendingOp[]): {
  title: string
  body: string
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  milestone: string | null
  reviewers: string[]
  isDraft?: boolean
} {
  let title = tracked.data.item.title
  let body = tracked.data.item.body || ''
  let state = tracked.data.item.state
  let labels = [...tracked.data.item.labels]
  let assignees = [...tracked.data.item.assignees]
  let milestone = tracked.data.item.milestone
  let reviewers = [...(tracked.data.pull?.requestedReviewers ?? [])]
  let isDraft = tracked.data.pull?.isDraft

  for (const op of ops) {
    switch (op.action) {
      case 'set-title':
        title = op.title
        break

      case 'set-body':
        body = op.body
        break

      case 'close':
      case 'close-with-comment':
        state = 'closed'
        break

      case 'reopen':
        state = 'open'
        break

      case 'add-labels':
        labels = mergeStrings(labels, op.labels)
        break

      case 'remove-labels':
        labels = removeStrings(labels, op.labels)
        break

      case 'set-labels':
        labels = normalizeStringArray(op.labels)
        break

      case 'add-assignees':
        assignees = mergeStrings(assignees, op.assignees)
        break

      case 'remove-assignees':
        assignees = removeStrings(assignees, op.assignees)
        break

      case 'set-assignees':
        assignees = normalizeStringArray(op.assignees)
        break

      case 'set-milestone':
        milestone = String(op.milestone)
        break

      case 'clear-milestone':
        milestone = null
        break

      case 'request-reviewers':
        reviewers = mergeStrings(reviewers, op.reviewers)
        break

      case 'remove-reviewers':
        reviewers = removeStrings(reviewers, op.reviewers)
        break

      case 'convert-to-draft':
        if (tracked.kind === 'pull')
          isDraft = true
        break

      case 'mark-ready-for-review':
        if (tracked.kind === 'pull')
          isDraft = false
        break

      default:
        break
    }
  }

  return {
    title,
    body,
    state,
    labels,
    assignees,
    milestone,
    reviewers,
    isDraft,
  }
}

async function notifyAndGetBootstrap(
  onStateChanged: ((bootstrap: UiBootstrap) => Promise<void> | void) | undefined,
  getBootstrap: () => Promise<UiBootstrap>,
): Promise<UiBootstrap> {
  const bootstrap = await getBootstrap()
  await onStateChanged?.(bootstrap)
  return bootstrap
}

function getActionFamily(action: ActionName): QueueActionFamily {
  switch (action) {
    case 'set-title':
      return 'title'
    case 'set-body':
      return 'body'
    case 'close':
    case 'reopen':
      return 'state'
    case 'add-labels':
    case 'remove-labels':
    case 'set-labels':
      return 'labels'
    case 'add-assignees':
    case 'remove-assignees':
    case 'set-assignees':
      return 'assignees'
    case 'set-milestone':
    case 'clear-milestone':
      return 'milestone'
    case 'request-reviewers':
    case 'remove-reviewers':
      return 'reviewers'
    case 'mark-ready-for-review':
    case 'convert-to-draft':
      return 'draft'
    case 'add-comment':
    case 'close-with-comment':
      return 'comment'
    default:
      return 'other'
  }
}

function mergeStrings(base: string[], incoming: string[]): string[] {
  const known = new Set(base)
  const merged = [...base]
  for (const value of normalizeStringArray(incoming)) {
    if (known.has(value))
      continue
    known.add(value)
    merged.push(value)
  }
  return merged
}

function removeStrings(base: string[], removing: string[]): string[] {
  const removingSet = new Set(normalizeStringArray(removing))
  return base.filter(value => !removingSet.has(value))
}

function fireAndForget<T>(
  callback: ((payload: T) => Promise<void> | void) | undefined,
  payload: T,
): void {
  if (!callback)
    return

  void Promise.resolve(callback(payload)).catch(() => {})
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message
  return String(error)
}

interface RepoSnapshot {
  labels?: Array<{
    name: string
    color: string
    description: string | null
    default: boolean
  }>
  milestones?: Array<{
    number: number
    title: string
    state: 'open' | 'closed'
  }>
}

async function readRepoSnapshot(storageDirAbsolute: string): Promise<RepoSnapshot | undefined> {
  const path = resolve(storageDirAbsolute, REPO_SNAPSHOT_FILE_NAME)
  if (!await pathExists(path))
    return undefined

  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as RepoSnapshot
  }
  catch {
    return undefined
  }
}
