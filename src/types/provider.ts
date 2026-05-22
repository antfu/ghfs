import type { IssueKind, IssueState } from '../types'
import type { ReactionContent } from '../utils/reactions'

export interface ProviderReactions {
  totalCount: number
  plusOne: number
  minusOne: number
  laugh: number
  hooray: number
  confused: number
  heart: number
  rocket: number
  eyes: number
}

export type IssueStateReason = 'completed' | 'not_planned' | 'reopened'

export interface ProviderItem {
  number: number
  kind: IssueKind
  url?: string
  state: IssueState
  stateReason?: IssueStateReason | null
  updatedAt: string
  createdAt: string
  closedAt: string | null
  title: string
  body: string | null
  author: string | null
  labels: string[]
  assignees: string[]
  milestone: string | null
  reactions?: ProviderReactions
}

export interface ProviderComment {
  id: number
  body: string | null
  createdAt: string
  updatedAt: string
  author: string | null
  reactions?: ProviderReactions
}

export interface ProviderPullMetadata {
  isDraft: boolean
  merged: boolean
  mergedAt: string | null
  baseRef: string
  headRef: string
  requestedReviewers: string[]
}

export interface ProviderCommit {
  sha: string
  message: string
  authorLogin: string | null
  authorName: string | null
  authorDate: string
  committerLogin: string | null
  committerDate: string
  url?: string
}

export type ProviderTimelineEventKind
  = | 'committed'
    | 'closed'
    | 'reopened'
    | 'merged'
    | 'labeled'
    | 'unlabeled'
    | 'assigned'
    | 'unassigned'
    | 'review_requested'
    | 'review_request_removed'
    | 'reviewed'
    | 'commented'
    | 'renamed'
    | 'head_ref_force_pushed'
    | 'head_ref_deleted'
    | 'head_ref_restored'
    | 'locked'
    | 'unlocked'
    | 'ready_for_review'
    | 'convert_to_draft'
    | 'referenced'
    | 'cross-referenced'
    | 'mentioned'
    | 'subscribed'
    | 'unsubscribed'
    | 'pinned'
    | 'unpinned'
    | 'transferred'
    | 'milestoned'
    | 'demilestoned'
    | 'marked_as_duplicate'
    | 'unmarked_as_duplicate'
    | 'connected'
    | 'disconnected'
    | 'auto_merge_enabled'
    | 'auto_merge_disabled'
    | 'auto_squash_enabled'
    | 'auto_squash_disabled'
    | 'auto_rebase_enabled'
    | 'auto_rebase_disabled'
    | 'base_ref_changed'
    | 'unknown'

/** Cross-reference target: the issue/PR that mentioned this item. */
export interface ProviderTimelineSource {
  number: number
  kind: 'issue' | 'pull'
  title?: string
  url?: string
  repo?: string
}

export type ProviderReviewState = 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending'

export interface ProviderTimelineEvent {
  id: string
  kind: ProviderTimelineEventKind
  createdAt: string
  actor: string | null
  sha?: string
  commitMessage?: string
  label?: { name: string, color: string }
  assignee?: string
  requestedReviewer?: string
  review?: {
    state: ProviderReviewState
    body: string | null
    submittedAt: string
    /** GraphQL node ID — required to react to a review body. */
    nodeId?: string
    reactions?: ProviderReactions
  }
  commentId?: number
  body?: string | null
  rename?: { from: string, to: string }
  stateReason?: string | null
  /** Populated for `referenced` and `cross-referenced` events. */
  source?: ProviderTimelineSource
  /** Populated for `milestoned` / `demilestoned` events. */
  milestone?: string
  /** Raw event name for events we don't model explicitly. */
  rawKind?: string
}

export interface ProviderRepository {
  name: string
  full_name: string
  description: string | null
  private: boolean
  archived: boolean
  default_branch: string
  html_url: string
  fork: boolean
  open_issues_count: number
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  created_at: string
  updated_at: string
  pushed_at: string | null
  owner: {
    login: string
  }
}

export interface ProviderLabel {
  name: string
  color: string
  description: string | null
  default: boolean
}

export interface ProviderAuthenticatedUser {
  login: string
  name: string | null
  avatarUrl: string
}

export interface ProviderMilestone {
  number: number
  title: string
  state: 'open' | 'closed'
  description: string | null
  due_on: string | null
  open_issues: number
  closed_issues: number
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface ProviderItemSnapshot {
  number: number
  kind: IssueKind
  updatedAt: string | null
}

export interface ProviderUpdateCounts {
  issues: number
  pulls: number
}

export type ProviderLockReason = 'resolved' | 'off-topic' | 'too heated' | 'too-heated' | 'spam'

/**
 * Where a reaction is applied. `item` = issue/PR body (uses `op.number`).
 * `comment` = issue/PR conversation comment. `review` = a PR review body
 * (review reactions go through GraphQL and need the review's node ID).
 */
export type ReactionTarget
  = | { kind: 'item' }
    | { kind: 'comment', commentId: number }
    | { kind: 'review', reviewId: string }

export interface PaginateItemsOptions {
  state: IssueState | 'all'
  since?: string
}

export interface RepositoryProvider {
  paginateItems: (options: PaginateItemsOptions) => AsyncIterable<ProviderItem[]>
  fetchItems: (options: PaginateItemsOptions) => Promise<ProviderItem[]>
  eachItem: (options: PaginateItemsOptions) => AsyncIterable<ProviderItem>
  fetchItemsByNumbers: (numbers: number[]) => Promise<ProviderItem[]>
  fetchComments: (number: number) => Promise<ProviderComment[]>
  fetchPullMetadata: (number: number) => Promise<ProviderPullMetadata>
  fetchPullPatch: (number: number) => Promise<string>
  fetchPullCommits: (number: number) => Promise<ProviderCommit[]>
  fetchTimeline: (number: number) => Promise<ProviderTimelineEvent[]>
  fetchItemSnapshot: (number: number) => Promise<ProviderItemSnapshot>
  fetchRepository: () => Promise<ProviderRepository>
  fetchRepositoryLabels: () => Promise<ProviderLabel[]>
  fetchRepositoryMilestones: () => Promise<ProviderMilestone[]>
  fetchAuthenticatedUser: () => Promise<ProviderAuthenticatedUser | null>
  countUpdatedSince: (since: string) => Promise<ProviderUpdateCounts>
  getRequestCount: () => number

  actionClose: (number: number) => Promise<void>
  actionReopen: (number: number) => Promise<void>
  actionSetTitle: (number: number, title: string) => Promise<void>
  actionSetBody: (number: number, body: string) => Promise<void>
  actionAddComment: (number: number, body: string) => Promise<void>
  actionAddLabels: (number: number, labels: string[]) => Promise<void>
  actionRemoveLabels: (number: number, labels: string[]) => Promise<void>
  actionSetLabels: (number: number, labels: string[]) => Promise<void>
  actionAddAssignees: (number: number, assignees: string[]) => Promise<void>
  actionRemoveAssignees: (number: number, assignees: string[]) => Promise<void>
  actionSetAssignees: (number: number, assignees: string[]) => Promise<void>
  actionSetMilestone: (number: number, milestone: string | number) => Promise<void>
  actionClearMilestone: (number: number) => Promise<void>
  actionLock: (number: number, reason?: ProviderLockReason) => Promise<void>
  actionUnlock: (number: number) => Promise<void>
  actionRequestReviewers: (number: number, reviewers: string[]) => Promise<void>
  actionRemoveReviewers: (number: number, reviewers: string[]) => Promise<void>
  actionMarkReadyForReview: (number: number) => Promise<void>
  actionConvertToDraft: (number: number) => Promise<void>
  actionAddReaction: (number: number, reaction: ReactionContent, target: ReactionTarget) => Promise<void>
  actionRemoveReaction: (number: number, reaction: ReactionContent, target: ReactionTarget) => Promise<void>
  fetchViewerReactions: (number: number, target: ReactionTarget) => Promise<ReactionContent[]>
}
