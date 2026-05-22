import type { IssueKind, IssueState } from '../../src/types/issue'
import type { SyncItemState } from '../../src/types/sync-state'
import type { HubRecentItem } from '#ghfs/rpc-types'

export interface ListItem {
  key: string
  projectId: string
  repo: string
  kind: IssueKind
  number: number
  title: string
  author?: string | null
  updatedAt?: string | null
  labels?: string[]
  state?: IssueState
  body?: string
  assignees?: string[]
  reactionsTotal?: number
  url?: string
  raw?: SyncItemState
}

export function listItemKey(input: { projectId: string, kind: IssueKind, number: number }): string {
  return `${input.projectId}-${input.kind}-${input.number}`
}

export function fromSyncItem(entry: SyncItemState, projectId: string, repo: string): ListItem {
  const item = entry.data.item
  return {
    key: listItemKey({ projectId, kind: item.kind, number: item.number }),
    projectId,
    repo,
    kind: item.kind,
    number: item.number,
    title: item.title,
    author: item.author,
    updatedAt: item.updatedAt,
    labels: item.labels,
    state: item.state,
    body: item.body ?? undefined,
    assignees: item.assignees,
    reactionsTotal: item.reactions?.totalCount,
    url: item.url,
    raw: entry,
  }
}

export function fromHubRecent(item: HubRecentItem, repoLookup?: (id: string) => string | undefined): ListItem {
  const repo = repoLookup?.(item.projectId) ?? item.repo
  return {
    key: listItemKey({ projectId: item.projectId, kind: item.kind, number: item.number }),
    projectId: item.projectId,
    repo,
    kind: item.kind,
    number: item.number,
    title: item.title,
    author: item.author,
    updatedAt: item.updatedAt,
    labels: item.labels,
    state: item.state,
  }
}
