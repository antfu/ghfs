export const ACTIONS_SUPPORTED = [
  'close',
  'close-with-comment',
  'reopen',
  'set-title',
  'set-body',
  'add-comment',
  'add-labels',
  'remove-labels',
  'set-labels',
  'add-assignees',
  'remove-assignees',
  'set-assignees',
  'set-milestone',
  'clear-milestone',
  'lock',
  'unlock',
  'request-reviewers',
  'remove-reviewers',
  'mark-ready-for-review',
  'convert-to-draft',
  'approve',
  'request-changes',
  'review-comment',
  'merge',
  'enqueue-merge',
  'add-reaction',
  'remove-reaction',
] as const

export type ActionName = typeof ACTIONS_SUPPORTED[number]

export const ACTIONS_ALIAS_MAP = {
  'open': 'reopen',
  'closes': 'close',
  'close-comment': 'close-with-comment',
  'comment-close': 'close-with-comment',
  'close-and-comment': 'close-with-comment',
  'comment-and-close': 'close-with-comment',
  'label': 'add-labels',
  'labels': 'add-labels',
  'tag': 'add-labels',
  'tags': 'add-labels',
  'add-tag': 'add-labels',
  'assign': 'add-assignees',
  'assignee': 'add-assignees',
  'assignees': 'add-assignees',
  'body': 'set-body',
  'title': 'set-title',
  'retitle': 'set-title',
  'ready': 'mark-ready-for-review',
  'undraft': 'mark-ready-for-review',
  'draft': 'convert-to-draft',
  'comment': 'add-comment',
  'reject': 'request-changes',
  'merge-when-ready': 'enqueue-merge',
} as const satisfies Record<string, ActionName>

export const ACTIONS_COLOR_HEX: Record<ActionName, string> = {
  'close': '#ef4444',
  'close-with-comment': '#fb7185',
  'reopen': '#22c55e',
  'set-title': '#3b82f6',
  'set-body': '#06b6d4',
  'add-comment': '#f97316',
  'add-labels': '#84cc16',
  'remove-labels': '#f43f5e',
  'set-labels': '#eab308',
  'add-assignees': '#10b981',
  'remove-assignees': '#fb7185',
  'set-assignees': '#0ea5e9',
  'set-milestone': '#6366f1',
  'clear-milestone': '#f59e0b',
  'lock': '#a855f7',
  'unlock': '#14b8a6',
  'request-reviewers': '#38bdf8',
  'remove-reviewers': '#e879f9',
  'mark-ready-for-review': '#34d399',
  'convert-to-draft': '#f472b6',
  'approve': '#16a34a',
  'request-changes': '#dc2626',
  'review-comment': '#0891b2',
  'merge': '#8b5cf6',
  'enqueue-merge': '#7c3aed',
  'add-reaction': '#fbbf24',
  'remove-reaction': '#fb923c',
}

export type ActionAlias = keyof typeof ACTIONS_ALIAS_MAP
export type ActionInput = ActionName | ActionAlias

const ACTION_NAMES_SET = new Set<ActionName>(ACTIONS_SUPPORTED)

export const ACTION_ALIASES = Object.keys(ACTIONS_ALIAS_MAP) as ActionAlias[]
export const ACTION_INPUTS = [...ACTIONS_SUPPORTED, ...ACTION_ALIASES] as const

export function resolveActionName(action: string): ActionName | undefined {
  const normalized = normalizeActionInput(action)
  if (!normalized)
    return undefined

  if (ACTION_NAMES_SET.has(normalized as ActionName))
    return normalized as ActionName

  return ACTIONS_ALIAS_MAP[normalized as ActionAlias]
}

export function normalizeActionInput(action: string): string {
  return action.trim().toLowerCase()
}
