import type { PendingOp } from './types'

export interface ExecuteDiffFields {
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  milestone: string | null
  reviewers?: string[]
  isDraft?: boolean
}

export interface ComputeExecuteDiffOpsOptions {
  number: number
  current: ExecuteDiffFields
  desired: ExecuteDiffFields
  ifUnchangedSince?: string
  includeBody?: boolean
}

export function computeExecuteDiffOps(options: ComputeExecuteDiffOpsOptions): PendingOp[] {
  const ops: PendingOp[] = []
  const ifUnchangedSince = options.ifUnchangedSince
  const current = normalizeDiffFields(options.current)
  const desired = normalizeDiffFields(options.desired)

  if (current.title !== desired.title) {
    ops.push({
      action: 'set-title',
      number: options.number,
      title: desired.title,
      ifUnchangedSince,
    })
  }

  if (options.includeBody && current.body !== desired.body && desired.body) {
    ops.push({
      action: 'set-body',
      number: options.number,
      body: desired.body,
      ifUnchangedSince,
    })
  }

  if (current.state !== desired.state) {
    ops.push({
      action: desired.state === 'closed' ? 'close' : 'reopen',
      number: options.number,
      ifUnchangedSince,
    })
  }

  if (!sameStringSet(current.labels, desired.labels)) {
    const additions = diffStrings(desired.labels, current.labels)
    const deletions = diffStrings(current.labels, desired.labels)

    if (additions.length > 0 && deletions.length > 0) {
      ops.push({
        action: 'set-labels',
        number: options.number,
        labels: desired.labels,
        ifUnchangedSince,
      })
    }
    else if (additions.length > 0) {
      ops.push({
        action: 'add-labels',
        number: options.number,
        labels: additions,
        ifUnchangedSince,
      })
    }
    else if (deletions.length > 0) {
      ops.push({
        action: 'remove-labels',
        number: options.number,
        labels: deletions,
        ifUnchangedSince,
      })
    }
  }

  if (!sameStringSet(current.assignees, desired.assignees)) {
    if (desired.assignees.length > 0) {
      ops.push({
        action: 'set-assignees',
        number: options.number,
        assignees: desired.assignees,
        ifUnchangedSince,
      })
    }
    else if (current.assignees.length > 0) {
      ops.push({
        action: 'remove-assignees',
        number: options.number,
        assignees: current.assignees,
        ifUnchangedSince,
      })
    }
  }

  if (current.milestone !== desired.milestone) {
    if (desired.milestone) {
      ops.push({
        action: 'set-milestone',
        number: options.number,
        milestone: desired.milestone,
        ifUnchangedSince,
      })
    }
    else {
      ops.push({
        action: 'clear-milestone',
        number: options.number,
        ifUnchangedSince,
      })
    }
  }

  if (!sameStringSet(current.reviewers, desired.reviewers)) {
    const additions = diffStrings(desired.reviewers, current.reviewers)
    const deletions = diffStrings(current.reviewers, desired.reviewers)

    if (additions.length > 0) {
      ops.push({
        action: 'request-reviewers',
        number: options.number,
        reviewers: additions,
        ifUnchangedSince,
      })
    }

    if (deletions.length > 0) {
      ops.push({
        action: 'remove-reviewers',
        number: options.number,
        reviewers: deletions,
        ifUnchangedSince,
      })
    }
  }

  if (typeof current.isDraft === 'boolean'
    && typeof desired.isDraft === 'boolean'
    && current.isDraft !== desired.isDraft) {
    ops.push({
      action: desired.isDraft ? 'convert-to-draft' : 'mark-ready-for-review',
      number: options.number,
      ifUnchangedSince,
    })
  }

  return ops
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  const unique = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string')
      continue
    const normalized = entry.trim()
    if (!normalized)
      continue
    unique.add(normalized)
  }

  return [...unique]
}

export function normalizeMilestone(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeBody(value: string | null): string | null {
  if (value == null)
    return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeDiffFields(fields: ExecuteDiffFields): Required<ExecuteDiffFields> {
  return {
    ...fields,
    title: fields.title.trim(),
    body: normalizeBody(fields.body),
    labels: normalizeStringArray(fields.labels),
    assignees: normalizeStringArray(fields.assignees),
    milestone: normalizeMilestone(fields.milestone),
    reviewers: normalizeStringArray(fields.reviewers),
    isDraft: Boolean(fields.isDraft),
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length)
    return false

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function diffStrings(source: string[], target: string[]): string[] {
  const targetSet = new Set(target)
  return source.filter(value => !targetSet.has(value))
}
