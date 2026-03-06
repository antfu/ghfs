import type { PendingOp } from '../../execute/types'
import type { ExecutionResult, IssueKind, IssueState } from '../../types'

export interface ConnectionMeta {
  backend: 'websocket'
  websocket: number
}

export type QueueSource = 'execute.yml' | 'execute.md' | 'per-item'

export interface UiItemSummary {
  number: number
  kind: IssueKind
  state: IssueState
  title: string
  updatedAt: string
  createdAt: string
  closedAt: string | null
  author: string | null
  url?: string
  labels: string[]
  assignees: string[]
  milestone: string | null
  commentsCount: number
  isDraft?: boolean
  merged?: boolean
  requestedReviewers?: string[]
}

export interface UiQueueEntry {
  id: string
  mergedIndex: number
  source: QueueSource
  sourceIndex: number
  editable: boolean
  op: PendingOp
  description: string
}

export interface UiBootstrap {
  repo?: string
  syncedAt?: string
  lastSyncRunAt?: string
  totalTracked: number
  openCount: number
  closedCount: number
  warnings: string[]
  items: UiItemSummary[]
  queue: UiQueueEntry[]
  queueSummary: {
    total: number
    executeYml: number
    executeMd: number
    perItem: number
  }
}

export interface UiLabel {
  name: string
  color: string
  description: string | null
  default: boolean
}

export interface UiMilestone {
  number: number
  title: string
  state: 'open' | 'closed'
}

export interface UiItemDetail extends UiItemSummary {
  body: string
  comments: Array<{
    id: number
    author: string | null
    body: string
    createdAt: string
    updatedAt: string
  }>
  labelsCatalog: UiLabel[]
  milestonesCatalog: UiMilestone[]
  queue: UiQueueEntry[]
}

export interface UiItemEdits {
  number: number
  title: string
  body: string
  state: IssueState
  labels: string[]
  assignees: string[]
  milestone: string | null
  reviewers: string[]
  isDraft?: boolean
  comment: string
}

export type UiExecuteProgressEvent
  = | {
    type: 'start'
    planned: number
    repo: string
  }
  | {
    type: 'progress'
    repo: string
    planned: number
    completed: number
    applied: number
    failed: number
    detail: ExecutionResult['details'][number]
  }
  | {
    type: 'error'
    message: string
  }

export interface UiExecuteNowResult {
  result: ExecutionResult
  bootstrap: UiBootstrap
}

export interface ServerFunctions {
  getBootstrap: () => Promise<UiBootstrap>
  getItemDetail: (number: number) => Promise<UiItemDetail>
  queueItemEdits: (payload: UiItemEdits) => Promise<UiBootstrap>
  removeQueueYmlEntry: (index: number) => Promise<UiBootstrap>
  refresh: () => Promise<UiBootstrap>
  executeNow: () => Promise<UiExecuteNowResult>
}

export interface ClientFunctions {
  onExecuteProgress: (event: UiExecuteProgressEvent) => void
  onExecuteComplete: (result: ExecutionResult) => void
  onStateChanged: (nextBootstrap: UiBootstrap) => void
}
