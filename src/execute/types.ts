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
  action: 'close' | 'reopen' | 'clear-milestone' | 'unlock' | 'mark-ready-for-review' | 'convert-to-draft'
}

export interface PendingReactionOp extends PendingOpBase {
  action: 'add-reaction' | 'remove-reaction'
  reaction: ReactionContent
  /** Omit to react on the issue/PR body itself. */
  target?: ReactionTarget
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
    | PendingReactionOp

export type PendingFile = PendingOp[]

export const PR_ONLY_ACTIONS: ActionName[] = [
  'request-reviewers',
  'remove-reviewers',
  'mark-ready-for-review',
  'convert-to-draft',
]

export const ACTIONS_WITH_BODY: ActionName[] = ['set-body', 'add-comment', 'close-with-comment']
export const ACTIONS_WITH_LABELS: ActionName[] = ['add-labels', 'remove-labels', 'set-labels']
export const ACTIONS_WITH_ASSIGNEES: ActionName[] = ['add-assignees', 'remove-assignees', 'set-assignees']
export const ACTIONS_WITH_REVIEWERS: ActionName[] = ['request-reviewers', 'remove-reviewers']
export const ACTIONS_WITH_REACTION: ActionName[] = ['add-reaction', 'remove-reaction']
