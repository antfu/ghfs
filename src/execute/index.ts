import type { ExecutionResult, GhfsResolvedConfig, IssueKind } from '../types'
import type { RepositoryProvider } from '../types/provider'
import type { PendingOp } from './types'
import process from 'node:process'
import { cancel, confirm, isCancel, multiselect } from '@clack/prompts'
import { createRepositoryProvider } from '../providers/factory'
import { ensureExecuteArtifacts } from './schema'
import { readAndValidateExecuteFile, writeExecuteFile } from './validate'

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
}

export async function executePendingChanges(options: ExecuteOptions): Promise<ExecutionResult> {
  await ensureExecuteArtifacts(options.executeFilePath)
  const allOps = await readAndValidateExecuteFile(options.executeFilePath)

  const interactive = process.stdin.isTTY && !options.nonInteractive
  const selected = interactive
    ? await selectOperations(allOps)
    : allOps.map((op, index) => ({ op, index }))

  const runId = createRunId()
  const createdAt = new Date().toISOString()

  if (selected.length === 0) {
    return {
      runId,
      createdAt,
      mode: options.apply ? 'apply' : 'dry-run',
      repo: options.repo,
      planned: 0,
      applied: 0,
      failed: 0,
      details: [],
    }
  }

  options.onPlan?.(selected.map(item => item.op))

  if (!options.apply) {
    return {
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
        message: describeAction(op),
      })),
    }
  }

  if (interactive) {
    const confirmed = await confirmApply(selected.length)
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
      await persistRemainingOps(options.executeFilePath, allOps, appliedIndexes)
      details.push({
        op: index + 1,
        action: op.action,
        number: op.number,
        target,
        status: 'applied',
        message: describeAction(op),
      })
      applied += 1
    }
    catch (error) {
      failed += 1
      details.push({
        op: index + 1,
        action: op.action,
        number: op.number,
        status: 'failed',
        message: (error as Error).message,
      })
      if (!options.continueOnError)
        break
    }
  }

  return {
    runId,
    createdAt,
    mode: 'apply',
    repo: options.repo,
    planned: selected.length,
    applied,
    failed,
    details,
  }
}

async function persistRemainingOps(path: string, allOps: PendingOp[], appliedIndexes: Set<number>): Promise<void> {
  const remaining = allOps.filter((_, index) => !appliedIndexes.has(index))
  await writeExecuteFile(path, remaining)
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

function describeAction(op: PendingOp): string {
  return `${op.action} #${op.number}`
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
  const random = Math.random().toString(36).slice(2, 7)
  return `run_${timestamp}_${random}`
}

async function selectOperations(ops: PendingOp[]): Promise<Array<{ op: PendingOp, index: number }>> {
  const result = await multiselect<number>({
    message: 'Select operations to include',
    options: ops.map((op, index) => ({
      label: `${index + 1}. ${describeAction(op)}`,
      value: index,
    })),
    required: false,
  })

  if (isCancel(result)) {
    cancel('Operation selection cancelled')
    throw new Error('Execution cancelled')
  }

  const selectedIndexes = new Set(result)
  return ops
    .map((op, index) => ({ op, index }))
    .filter(item => selectedIndexes.has(item.index))
}

async function confirmApply(count: number): Promise<boolean> {
  const result = await confirm({
    message: `Apply ${count} operation(s) to GitHub?`,
    initialValue: false,
  })

  if (isCancel(result)) {
    cancel('Execution cancelled')
    return false
  }

  return result
}

function ensurePullAction(action: PendingOp['action'], number: number, isPull: boolean): void {
  if (!isPull)
    throw new Error(`Action ${action} requires #${number} to be a pull request`)
}
