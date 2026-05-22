import type {
  ProviderReviewState,
  ProviderTimelineEvent,
  ProviderTimelineEventKind,
} from '../../../src/types/provider'

export interface ReviewStyle {
  border: string
  icon: string
  color: string
  label: string
}

export function reviewStyle(state: ProviderReviewState | string): ReviewStyle {
  if (state === 'approved')
    return { border: 'border-green-500/40', icon: 'i-octicon-check-circle-fill-16', color: 'color-green-600 dark:color-green-500', label: 'approved these changes' }
  if (state === 'changes_requested')
    return { border: 'border-red-500/40', icon: 'i-octicon-file-diff-16', color: 'color-red-600 dark:color-red-500', label: 'requested changes' }
  if (state === 'dismissed')
    return { border: 'border-neutral-500/40', icon: 'i-octicon-x-16', color: 'color-neutral-500 dark:color-neutral-400', label: 'dismissed a review' }
  return { border: 'border-blue-500/40', icon: 'i-octicon-comment-16', color: 'color-blue-600 dark:color-blue-500', label: 'reviewed' }
}

const eventIcon: Partial<Record<ProviderTimelineEventKind, string>> = {
  committed: 'i-octicon-git-commit-16',
  closed: 'i-octicon-issue-closed-16',
  reopened: 'i-octicon-issue-reopened-16',
  merged: 'i-octicon-git-merge-16',
  labeled: 'i-octicon-tag-16',
  unlabeled: 'i-octicon-tag-16',
  assigned: 'i-octicon-person-16',
  unassigned: 'i-octicon-person-16',
  review_requested: 'i-octicon-eye-16',
  review_request_removed: 'i-octicon-eye-closed-16',
  review_dismissed: 'i-octicon-x-16',
  renamed: 'i-octicon-pencil-16',
  head_ref_force_pushed: 'i-octicon-repo-push-16',
  head_ref_deleted: 'i-octicon-trash-16',
  head_ref_restored: 'i-octicon-history-16',
  locked: 'i-octicon-lock-16',
  unlocked: 'i-octicon-lock-16',
  ready_for_review: 'i-octicon-git-pull-request-16',
  convert_to_draft: 'i-octicon-git-pull-request-draft-16',
  referenced: 'i-octicon-bookmark-16',
  'cross-referenced': 'i-octicon-cross-reference-16',
  pinned: 'i-octicon-pin-16',
  unpinned: 'i-octicon-pin-slash-16',
  transferred: 'i-octicon-arrow-right-16',
  milestoned: 'i-octicon-milestone-16',
  demilestoned: 'i-octicon-milestone-16',
  marked_as_duplicate: 'i-octicon-copy-16',
  unmarked_as_duplicate: 'i-octicon-copy-16',
  connected: 'i-octicon-link-16',
  disconnected: 'i-octicon-link-slash-16',
  auto_merge_enabled: 'i-octicon-git-merge-16',
  auto_merge_disabled: 'i-octicon-git-merge-16',
  auto_squash_enabled: 'i-octicon-git-merge-16',
  auto_squash_disabled: 'i-octicon-git-merge-16',
  auto_rebase_enabled: 'i-octicon-git-merge-16',
  auto_rebase_disabled: 'i-octicon-git-merge-16',
  base_ref_changed: 'i-octicon-git-branch-16',
  unknown: 'i-octicon-dot-16',
}

const eventColor: Partial<Record<ProviderTimelineEventKind, string>> = {
  merged: 'color-purple-600 dark:color-purple-400',
  closed: 'color-red-600 dark:color-red-500',
  reopened: 'color-green-600 dark:color-green-500',
  ready_for_review: 'color-green-600 dark:color-green-500',
  convert_to_draft: 'color-neutral-500 dark:color-neutral-400',
}

export function iconFor(event: ProviderTimelineEvent): string {
  return eventIcon[event.kind] ?? 'i-octicon-dot-16'
}

export function colorFor(event: ProviderTimelineEvent): string {
  return eventColor[event.kind] ?? 'color-muted'
}

/** Humanize a snake/kebab-cased event name into lowercase words. */
export function humanize(name: string): string {
  return name.replace(/[_-]+/g, ' ').toLowerCase()
}

/** GitHub commit URL given a `owner/repo` string and a SHA. Returns `null` if either is missing. */
export function commitUrlFor(repo: string | undefined | null, sha: string | undefined | null): string | null {
  if (!repo || !sha)
    return null
  return `https://github.com/${repo}/commit/${sha}`
}

/** Kinds the renderer hides by default — match GitHub's own behavior. */
const HIDDEN_KINDS = new Set<ProviderTimelineEventKind>(['subscribed', 'unsubscribed', 'mentioned'])

export function isHiddenEvent(event: ProviderTimelineEvent): boolean {
  return HIDDEN_KINDS.has(event.kind)
}
