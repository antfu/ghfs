import type { IssueKind, IssueState } from '../../src/types/issue'
import type { IssueStateReason } from '../../src/types/provider'
import type { SyncItemState } from '../../src/types/sync-state'
import type { HubRecentItem } from '#ghfs/rpc-types'
import { activityBucketIndex, computeItemActivityBuckets } from '../../src/sync/activity'

const ACTIVITY_DAYS = 180

export interface ListItem {
  key: string
  projectId: string
  repo: string
  kind: IssueKind
  number: number
  title: string
  author?: string | null
  authorAvatarUrl?: string
  updatedAt?: string | null
  labels?: string[]
  state?: IssueState
  stateReason?: IssueStateReason | null
  pullIsDraft?: boolean
  pullMerged?: boolean
  body?: string
  assignees?: string[]
  reactionsTotal?: number
  url?: string
  raw?: SyncItemState
  activityBuckets?: number[]
  /**
   * Index in `activityBuckets` where the item was created.
   * `undefined` when the item was created before the sparkline window.
   */
  activityCreatedIndex?: number
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
    authorAvatarUrl: item.authorAvatarUrl,
    updatedAt: item.updatedAt,
    labels: item.labels,
    state: item.state,
    body: item.body ?? undefined,
    assignees: item.assignees,
    reactionsTotal: item.reactions?.totalCount,
    url: item.url,
    raw: entry,
    activityBuckets: computeItemActivityBuckets(entry.data, ACTIVITY_DAYS).buckets,
    activityCreatedIndex: activityBucketIndex(item.createdAt, ACTIVITY_DAYS),
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
    authorAvatarUrl: item.authorAvatarUrl,
    updatedAt: item.updatedAt,
    labels: item.labels,
    state: item.state,
    stateReason: item.stateReason,
    pullIsDraft: item.pullIsDraft,
    pullMerged: item.pullMerged,
  }
}
