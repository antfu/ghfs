import type { IssueKind } from './issue'

export interface ExecutionResult {
  runId: string
  createdAt: string
  mode: 'report' | 'apply'
  repo: string
  applied: number
  planned: number
  failed: number
  details: Array<{
    op: number
    action: string
    number: number
    target?: IssueKind
    status: 'planned' | 'applied' | 'failed' | 'skipped'
    message: string
  }>
}
