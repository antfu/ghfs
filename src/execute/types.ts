import type { ReactionTarget } from '../types/provider'
import type { ReactionContent } from '../utils/reactions'
import type { ActionName } from './actions'

export interface PendingOpBase {
  number: number
  action: ActionName
  ifUnchangedSince?: string
}

export interface PendingTitleOp extends PendingOpBase {
  action: 'set-title'
  title: string
}

export interface PendingBodyOp extends PendingOpBase {
  action: 'set-body'
  body: string
}

export interface PendingCommentOp extends PendingOpBase {
  action: 'add-comment' | 'close-with-comment'
  body: string
}

export interface PendingLabelsOp extends PendingOpBase {
  action: 'add-labels' | 'remove-labels' | 'set-labels'
  labels: string[]
}

export interface PendingAssigneesOp extends PendingOpBase {
  action: 'add-assignees' | 'remove-assignees' | 'set-assignees'
  assignees: string[]
}

export interface PendingSetMilestoneOp extends PendingOpBase {
  action: 'set-milestone'
  milestone: string | number
}

export interface PendingLockOp extends PendingOpBase {
  action: 'lock'
  reason?: 'resolved' | 'off-topic' | 'too heated' | 'too-heated' | 'spam'
}

export interface PendingReviewersOp extends PendingOpBase {
  action: 'request-reviewers' | 'remove-reviewers'
  reviewers: string[]
}

export interface PendingSimpleOp extends PendingOpBase {
  action: 'close' | 'reopen' | 'clear-milestone' | 'unlock' | 'mark-ready-for-review' | 'convert-to-draft' | 'enqueue-merge'
}

export interface PendingReactionOp extends PendingOpBase {
  action: 'add-reaction' | 'remove-reaction'
  reaction: ReactionContent
  /** Omit to react on the issue/PR body itself. */
  target?: ReactionTarget
}

export interface PendingReviewOp extends PendingOpBase {
  action: 'approve' | 'request-changes' | 'review-comment'
  /** Optional for `approve`; required for `request-changes` and `review-comment`. */
  body?: string
}

export type MergeMethod = 'squash' | 'merge' | 'rebase'

export interface PendingMergeOp extends PendingOpBase {
  action: 'merge'
  /** Defaults to `squash` when omitted. */
  method?: MergeMethod
  commitTitle?: string
  commitMessage?: string
}

export type PendingOp
  = | PendingSimpleOp
    | PendingTitleOp
    | PendingBodyOp
    | PendingCommentOp
    | PendingLabelsOp
    | PendingAssigneesOp
    | PendingSetMilestoneOp
    | PendingLockOp
    | PendingReviewersOp
    | PendingReviewOp
    | PendingMergeOp
    | PendingReactionOp

export type PendingFile = PendingOp[]

export const PR_ONLY_ACTIONS: ActionName[] = [
  'request-reviewers',
  'remove-reviewers',
  'mark-ready-for-review',
  'convert-to-draft',
  'approve',
  'request-changes',
  'review-comment',
  'merge',
  'enqueue-merge',
]

export const ACTIONS_WITH_BODY: ActionName[] = ['set-body', 'add-comment', 'close-with-comment', 'approve', 'request-changes', 'review-comment']
export const ACTIONS_WITH_LABELS: ActionName[] = ['add-labels', 'remove-labels', 'set-labels']
export const ACTIONS_WITH_ASSIGNEES: ActionName[] = ['add-assignees', 'remove-assignees', 'set-assignees']
export const ACTIONS_WITH_REVIEWERS: ActionName[] = ['request-reviewers', 'remove-reviewers']
export const ACTIONS_WITH_REACTION: ActionName[] = ['add-reaction', 'remove-reaction']
export const ACTIONS_REVIEW: ActionName[] = ['approve', 'request-changes', 'review-comment']
export const MERGE_METHODS: MergeMethod[] = ['squash', 'merge', 'rebase']
