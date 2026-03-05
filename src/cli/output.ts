import type { PendingOp } from '../execute/types'
import type { SyncSummary } from '../sync'
import type { StatusSummary } from '../sync/status'
import type { ExecutionResult } from '../types'

export function printSyncSummary(summary: SyncSummary): void {
  console.log(`Synced ${summary.repo} at ${summary.syncedAt}`)
  console.log(`- since: ${summary.since ?? '(full)'}`)
  console.log(`- scanned: ${summary.scanned}`)
  console.log(`- markdown written: ${summary.written}`)
  console.log(`- moved: ${summary.moved}`)
  console.log(`- patch written: ${summary.patchesWritten}`)
  console.log(`- patch deleted: ${summary.patchesDeleted}`)
}

export function printExecutionPlan(ops: PendingOp[]): void {
  console.log(`Planned operations (${ops.length}):`)
  for (const [index, op] of ops.entries())
    console.log(`- ${index + 1}. ${describeAction(op)}`)
}

export function printExecutionResult(result: ExecutionResult): void {
  console.log(`Execution ${result.mode} finished. planned=${result.planned} applied=${result.applied} failed=${result.failed}`)
  for (const detail of result.details)
    console.log(`- [${detail.status}] op ${detail.op}: ${detail.message}`)
}

export function printStatusSummary(summary: StatusSummary): void {
  console.log('ghfs status')
  console.log(`- repo: ${summary.repo ?? '(not resolved yet)'}`)
  console.log(`- last sync: ${summary.lastSyncedAt ?? '(never)'}`)
  console.log(`- tracked items: ${summary.totalTracked} (open=${summary.openCount}, closed=${summary.closedCount})`)
  console.log(`- execution runs: ${summary.executionRuns}`)
  if (summary.lastExecution) {
    console.log(`- last execution: ${summary.lastExecution.runId} at ${summary.lastExecution.createdAt}`)
    console.log(`  mode=${summary.lastExecution.mode} planned=${summary.lastExecution.planned} applied=${summary.lastExecution.applied} failed=${summary.lastExecution.failed}`)
  }
}

export function printCommandError(error: unknown): void {
  const message = (error as Error).message || String(error)
  console.error(`ghfs error: ${message}`)
}

function describeAction(op: PendingOp): string {
  return `${op.action} #${op.number}`
}
