import type { PendingOp } from '../types'
import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { parse } from 'yaml'
import { loadSyncState } from '../../sync/state'
import { formatIssueNumber } from '../../utils/format'
import { pathExists } from '../../utils/fs'
import {
  computeExecuteDiffOps,
  normalizeMilestone as normalizeMilestoneInput,
  normalizeStringArray as normalizeStringArrayInput,
} from '../diff'

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
  return computeExecuteDiffOps({
    number: input.number,
    current: {
      ...input.current,
      body: null,
      reviewers: [],
    },
    desired: {
      ...input.desired,
      body: null,
      reviewers: [],
    },
    ifUnchangedSince: input.updatedAt,
  })
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

  const labels = normalizeStringArrayInput(data.labels ?? data.tags)
  const assignees = normalizeStringArrayInput(data.assignees)
  const milestone = normalizeMilestoneInput(data.milestone)

  return {
    title,
    state,
    labels,
    assignees,
    milestone,
  }
}
