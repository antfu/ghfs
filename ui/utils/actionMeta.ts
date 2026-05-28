import type { ActionName } from '#ghfs/action-colors'

export interface ActionMeta {
  label: string
  icon: string
}

export const ACTION_META: Record<ActionName, ActionMeta> = {
  'close': { label: 'Close', icon: 'i-octicon-issue-closed-16' },
  'close-with-comment': { label: 'Close with comment', icon: 'i-octicon-issue-closed-16' },
  'reopen': { label: 'Reopen', icon: 'i-octicon-issue-reopened-16' },
  'set-title': { label: 'Set title', icon: 'i-octicon-pencil-16' },
  'set-body': { label: 'Set body', icon: 'i-octicon-pencil-16' },
  'add-comment': { label: 'Add comment', icon: 'i-octicon-comment-16' },
  'add-labels': { label: 'Add labels', icon: 'i-octicon-tag-16' },
  'remove-labels': { label: 'Remove labels', icon: 'i-octicon-tag-16' },
  'set-labels': { label: 'Set labels', icon: 'i-octicon-tag-16' },
  'add-assignees': { label: 'Add assignees', icon: 'i-octicon-person-add-16' },
  'remove-assignees': { label: 'Remove assignees', icon: 'i-octicon-person-16' },
  'set-assignees': { label: 'Set assignees', icon: 'i-octicon-person-16' },
  'set-milestone': { label: 'Set milestone', icon: 'i-octicon-milestone-16' },
  'clear-milestone': { label: 'Clear milestone', icon: 'i-octicon-milestone-16' },
  'lock': { label: 'Lock', icon: 'i-octicon-lock-16' },
  'unlock': { label: 'Unlock', icon: 'i-octicon-unlock-16' },
  'request-reviewers': { label: 'Request reviewers', icon: 'i-octicon-eye-16' },
  'remove-reviewers': { label: 'Remove reviewers', icon: 'i-octicon-eye-16' },
  'mark-ready-for-review': { label: 'Mark ready for review', icon: 'i-octicon-git-pull-request-16' },
  'convert-to-draft': { label: 'Convert to draft', icon: 'i-octicon-git-pull-request-draft-16' },
  'approve': { label: 'Approve', icon: 'i-octicon-check-16' },
  'request-changes': { label: 'Request changes', icon: 'i-octicon-x-16' },
  'review-comment': { label: 'Review comment', icon: 'i-octicon-comment-discussion-16' },
  'merge': { label: 'Merge', icon: 'i-octicon-git-merge-16' },
  'enqueue-merge': { label: 'Enqueue for merge', icon: 'i-octicon-git-merge-queue-16' },
  'add-reaction': { label: 'Add reaction', icon: 'i-octicon-smiley-16' },
  'remove-reaction': { label: 'Remove reaction', icon: 'i-octicon-smiley-16' },
}

export function actionMeta(action: ActionName | string): ActionMeta {
  return ACTION_META[action as ActionName] ?? { label: action, icon: 'i-octicon-dot-16' }
}
