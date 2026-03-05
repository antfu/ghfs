import type { ExecutionResult, GhfsResolvedConfig, IssueKind } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { PendingOp } from './types'
import process from 'node:process'
import { createRepositoryProvider } from '../providers/factory'
import { describeAction } from '../utils/format'
import { ensureExecuteArtifacts } from './schema'
import { loadExecuteSources } from './sources'

export interface ExecutePrompts {
  selectOperations: (ops: PendingOp[]) => Promise<number[] | undefined>
  confirmApply: (count: number) => Promise<boolean | undefined>
}

export interface ExecuteOptions {
  config: GhfsResolvedConfig
  repo: string
  token: string
  provider?: RepositoryProvider
  executeFilePath: string
  apply: boolean
  nonInteractive: boolean
  continueOnError: boolean
  onPlan?: (ops: PendingOp[]) => void
  onWarning?: (warning: string) => void
  reporter?: ExecuteReporter
  prompts?: ExecutePrompts
}

export interface ExecuteReporterStartEvent {
  repo: string
  mode: 'dry-run' | 'apply'
  planned: number
}

export interface ExecuteReporterProgressEvent {
  repo: string
  mode: 'apply'
  planned: number
  completed: number
  applied: number
  failed: number
  detail: ExecutionResult['details'][number]
}

export interface ExecuteReporterCompleteEvent {
  result: ExecutionResult
}

export interface ExecuteReporterErrorEvent {
  error: unknown
}

export interface ExecuteReporter {
  onStart?: (event: ExecuteReporterStartEvent) => void
  onProgress?: (event: ExecuteReporterProgressEvent) => void
  onComplete?: (event: ExecuteReporterCompleteEvent) => void
  onError?: (event: ExecuteReporterErrorEvent) => void
}

export async function executePendingChanges(options: ExecuteOptions): Promise<ExecutionResult> {
  try {
    await ensureExecuteArtifacts(options.executeFilePath)
    const sources = await loadExecuteSources(options.executeFilePath)
    const allOps = sources.ops
    for (const warning of sources.warnings)
      options.onWarning?.(warning)

    if (allOps.length === 0) {
      return {
        runId: createRunId(),
        createdAt: new Date().toISOString(),
        mode: 'dry-run',
        repo: options.repo,
        planned: 0,
        applied: 0,
        failed: 0,
        details: [],
      }
    }

    const interactive = process.stdin.isTTY && !options.nonInteractive
    if (interactive && !options.prompts)
      throw new Error('Interactive execute prompts are unavailable. Use --non-interactive or provide prompts.')

    const selected = interactive
      ? await selectOperations(allOps, options.prompts!)
      : allOps.map((op, index) => ({ op, index }))

    const runId = createRunId()
    const createdAt = new Date().toISOString()
    const mode = options.apply ? 'apply' : 'dry-run'

    options.reporter?.onStart?.({
      repo: options.repo,
      mode,
      planned: selected.length,
    })

    if (selected.length === 0) {
      const result: ExecutionResult = {
        runId,
        createdAt,
        mode,
        repo: options.repo,
        planned: 0,
        applied: 0,
        failed: 0,
        details: [],
      }
      options.reporter?.onComplete?.({ result })
      return result
    }

    options.onPlan?.(selected.map(item => item.op))

    if (!options.apply) {
      const result: ExecutionResult = {
        runId,
        createdAt,
        mode: 'dry-run',
        repo: options.repo,
        planned: selected.length,
        applied: 0,
        failed: 0,
        details: selected.map(({ op, index }) => ({
          op: index + 1,
          action: op.action,
          number: op.number,
          status: 'planned',
          message: describeAction(op.action, op.number),
        })),
      }
      options.reporter?.onComplete?.({ result })
      return result
    }

    if (interactive) {
      const confirmed = await confirmApply(selected.length, options.prompts!)
      if (!confirmed)
        throw new Error('Execution cancelled')
    }

    const provider = options.provider ?? createRepositoryProvider({
      token: options.token,
      repo: options.repo,
    })

    const details: ExecutionResult['details'] = []
    const appliedIndexes = new Set<number>()
    let applied = 0
    let failed = 0

    for (const { op, index } of selected) {
      try {
        const target = await applyOperation(provider, op)
        appliedIndexes.add(index)
        await persistRemainingOps(sources.writeRemaining, allOps, appliedIndexes)
        const detail: ExecutionResult['details'][number] = {
          op: index + 1,
          action: op.action,
          number: op.number,
          target,
          status: 'applied',
          message: describeAction(op.action, op.number),
        }
        details.push(detail)
        applied += 1
        options.reporter?.onProgress?.({
          repo: options.repo,
          mode: 'apply',
          planned: selected.length,
          completed: details.length,
          applied,
          failed,
          detail,
        })
      }
      catch (error) {
        failed += 1
        const detail: ExecutionResult['details'][number] = {
          op: index + 1,
          action: op.action,
          number: op.number,
          status: 'failed',
          message: (error as Error).message,
        }
        details.push(detail)
        options.reporter?.onProgress?.({
          repo: options.repo,
          mode: 'apply',
          planned: selected.length,
          completed: details.length,
          applied,
          failed,
          detail,
        })
        if (!options.continueOnError)
          break
      }
    }

    const result: ExecutionResult = {
      runId,
      createdAt,
      mode: 'apply',
      repo: options.repo,
      planned: selected.length,
      applied,
      failed,
      details,
    }

    options.reporter?.onComplete?.({ result })
    return result
  }
  catch (error) {
    options.reporter?.onError?.({ error })
    throw error
  }
}

async function persistRemainingOps(writeRemaining: (remainingIndexes: Set<number>) => Promise<void>, allOps: PendingOp[], appliedIndexes: Set<number>): Promise<void> {
  const remainingIndexes = new Set<number>()
  for (const [index] of allOps.entries()) {
    if (!appliedIndexes.has(index))
      remainingIndexes.add(index)
  }
  await writeRemaining(remainingIndexes)
}

async function applyOperation(provider: RepositoryProvider, op: PendingOp): Promise<IssueKind> {
  const item = await provider.fetchItemSnapshot(op.number)
  const isPull = item.kind === 'pull'

  if (op.ifUnchangedSince) {
    const remoteUpdatedAt = item.updatedAt
    if (remoteUpdatedAt && new Date(remoteUpdatedAt).getTime() > new Date(op.ifUnchangedSince).getTime())
      throw new Error(`Operation conflict: remote updated_at=${remoteUpdatedAt}`)
  }

  switch (op.action) {
    case 'close':
      await provider.actionClose(op.number)
      break

    case 'reopen':
      await provider.actionReopen(op.number)
      break

    case 'set-title':
      await provider.actionSetTitle(op.number, op.title)
      break

    case 'set-body':
      await provider.actionSetBody(op.number, op.body)
      break

    case 'add-comment':
      await provider.actionAddComment(op.number, op.body)
      break

    case 'add-labels':
      await provider.actionAddLabels(op.number, op.labels)
      break

    case 'remove-labels':
      await provider.actionRemoveLabels(op.number, op.labels)
      break

    case 'set-labels':
      await provider.actionSetLabels(op.number, op.labels)
      break

    case 'add-assignees':
      await provider.actionAddAssignees(op.number, op.assignees)
      break

    case 'remove-assignees':
      await provider.actionRemoveAssignees(op.number, op.assignees)
      break

    case 'set-assignees':
      await provider.actionSetAssignees(op.number, op.assignees)
      break

    case 'set-milestone':
      await provider.actionSetMilestone(op.number, op.milestone)
      break

    case 'clear-milestone':
      await provider.actionClearMilestone(op.number)
      break

    case 'lock':
      await provider.actionLock(op.number, op.reason)
      break

    case 'unlock':
      await provider.actionUnlock(op.number)
      break

    case 'request-reviewers':
      ensurePullAction(op.action, op.number, isPull)
      await provider.actionRequestReviewers(op.number, op.reviewers)
      break

    case 'remove-reviewers':
      ensurePullAction(op.action, op.number, isPull)
      await provider.actionRemoveReviewers(op.number, op.reviewers)
      break

    case 'mark-ready-for-review':
      ensurePullAction(op.action, op.number, isPull)
      await provider.actionMarkReadyForReview(op.number)
      break

    case 'convert-to-draft':
      ensurePullAction(op.action, op.number, isPull)
      await provider.actionConvertToDraft(op.number)
      break

    default:
      throw new Error(`Unsupported action: ${String((op as { action: string }).action)}`)
  }

  return item.kind
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
  const random = Math.random().toString(36).slice(2, 7)
  return `run_${timestamp}_${random}`
}

async function selectOperations(
  ops: PendingOp[],
  prompts: ExecutePrompts,
): Promise<Array<{ op: PendingOp, index: number }>> {
  const selectedIndexes = await prompts.selectOperations(ops)
  if (!selectedIndexes)
    throw new Error('Execution cancelled')

  const selectedIndexesSet = new Set(selectedIndexes)
  return ops
    .map((op, index) => ({ op, index }))
    .filter(item => selectedIndexesSet.has(item.index))
}

async function confirmApply(count: number, prompts: ExecutePrompts): Promise<boolean> {
  const result = await prompts.confirmApply(count)
  if (result == null)
    return false
  return result
}

function ensurePullAction(action: PendingOp['action'], number: number, isPull: boolean): void {
  if (!isPull)
    throw new Error(`Action ${action} requires #${number} to be a pull request`)
}
