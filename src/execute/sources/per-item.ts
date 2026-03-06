import type { PendingOp } from '../types'
import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { parse } from 'yaml'
import { loadSyncState } from '../../sync/state'
import { formatIssueNumber } from '../../utils/format'
import { pathExists } from '../../utils/fs'

export interface PerItemSourceResult {
  ops: PendingOp[]
  warnings: string[]
}

export async function loadPerItemSource(storageDir: string): Promise<PerItemSourceResult> {
  const syncState = await loadSyncState(storageDir)
  const ops: PendingOp[] = []
  const warnings: string[] = []
  const repo = syncState.repo

  for (const tracked of Object.values(syncState.items)) {
    const markdownPath = join(storageDir, tracked.filePath)
    if (!await pathExists(markdownPath)) {
      warnings.push(`per-item: missing markdown for ${formatIssueNumber(tracked.number, { repo })} (${tracked.filePath})`)
      continue
    }

    const raw = await readFile(markdownPath, 'utf8')
    const frontmatter = parseFrontmatter(raw)
    if (!frontmatter) {
      warnings.push(`per-item: invalid or missing frontmatter for ${formatIssueNumber(tracked.number, { repo })}`)
      continue
    }

    const trackedItem = tracked.data.item
    const itemOps = computePerItemOps({
      number: tracked.number,
      current: {
        title: trackedItem.title,
        state: trackedItem.state,
        labels: trackedItem.labels,
        assignees: trackedItem.assignees,
        milestone: trackedItem.milestone,
      },
      desired: frontmatter,
      updatedAt: trackedItem.updatedAt,
    })
    ops.push(...itemOps)
  }

  return { ops, warnings }
}

interface PerItemFields {
  title: string
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  milestone: string | null
}

interface PerItemCompareInput {
  number: number
  current: PerItemFields
  desired: PerItemFields
  updatedAt: string
}

function computePerItemOps(input: PerItemCompareInput): PendingOp[] {
  const ops: PendingOp[] = []
  const ifUnchangedSince = input.updatedAt

  if (input.current.title !== input.desired.title) {
    ops.push({
      action: 'set-title',
      number: input.number,
      title: input.desired.title,
      ifUnchangedSince,
    })
  }

  if (input.current.state !== input.desired.state) {
    ops.push({
      action: input.desired.state === 'closed' ? 'close' : 'reopen',
      number: input.number,
      ifUnchangedSince,
    })
  }

  if (!sameStringSet(input.current.labels, input.desired.labels)) {
    if (input.desired.labels.length > 0) {
      ops.push({
        action: 'set-labels',
        number: input.number,
        labels: input.desired.labels,
        ifUnchangedSince,
      })
    }
    else if (input.current.labels.length > 0) {
      ops.push({
        action: 'remove-labels',
        number: input.number,
        labels: input.current.labels,
        ifUnchangedSince,
      })
    }
  }

  if (!sameStringSet(input.current.assignees, input.desired.assignees)) {
    if (input.desired.assignees.length > 0) {
      ops.push({
        action: 'set-assignees',
        number: input.number,
        assignees: input.desired.assignees,
        ifUnchangedSince,
      })
    }
    else if (input.current.assignees.length > 0) {
      ops.push({
        action: 'remove-assignees',
        number: input.number,
        assignees: input.current.assignees,
        ifUnchangedSince,
      })
    }
  }

  if (normalizeMilestone(input.current.milestone) !== normalizeMilestone(input.desired.milestone)) {
    if (input.desired.milestone) {
      ops.push({
        action: 'set-milestone',
        number: input.number,
        milestone: input.desired.milestone,
        ifUnchangedSince,
      })
    }
    else {
      ops.push({
        action: 'clear-milestone',
        number: input.number,
        ifUnchangedSince,
      })
    }
  }

  return ops
}

function parseFrontmatter(raw: string): PerItemFields | undefined {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match)
    return undefined

  let parsed: unknown
  try {
    parsed = parse(match[1])
  }
  catch {
    return undefined
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return undefined

  const data = parsed as Record<string, unknown>
  const title = typeof data.title === 'string' && data.title.trim().length > 0
    ? data.title.trim()
    : undefined
  const state = data.state === 'open' || data.state === 'closed'
    ? data.state
    : undefined

  if (!title || !state)
    return undefined

  const labels = normalizeStringArray(data.labels ?? data.tags)
  const assignees = normalizeStringArray(data.assignees)
  const milestone = normalizeMilestone(data.milestone)

  return {
    title,
    state,
    labels,
    assignees,
    milestone,
  }
}

function normalizeStringArray(value: unknown): string[] {
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

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length)
    return false

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function normalizeMilestone(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}
