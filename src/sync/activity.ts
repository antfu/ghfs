import type { SyncState } from '../types/sync-state'

export interface ActivityResult {
  buckets: number[]
  total: number
  days: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Build daily activity buckets over the trailing `days` window. Buckets are
 * ordered oldest-first (index 0 is `days-1` days ago, last index is today).
 *
 * Counts every dated event that touched an item: created/updated/closed
 * timestamps on the item itself, comments, timeline events, commits, and
 * pull-request merges. A single bucket can therefore be incremented multiple
 * times by the same item — that's intentional, each event is its own
 * "activity beat".
 */
export function computeProjectActivityBuckets(
  state: SyncState,
  days = 90,
  now = Date.now(),
): ActivityResult {
  const buckets = Array.from<number>({ length: days }).fill(0)
  const startOfTodayMs = startOfUtcDay(now)
  let total = 0

  const tally = (iso: string | null | undefined) => {
    if (!iso)
      return
    const ts = Date.parse(iso)
    if (Number.isNaN(ts))
      return
    const daysAgo = Math.floor((startOfTodayMs - startOfUtcDay(ts)) / MS_PER_DAY)
    if (daysAgo < 0 || daysAgo >= days)
      return
    buckets[days - 1 - daysAgo] += 1
    total += 1
  }

  for (const entry of Object.values(state.items)) {
    const data = entry.data
    tally(data.item.createdAt)
    tally(data.item.updatedAt)
    tally(data.item.closedAt)
    for (const c of data.comments ?? [])
      tally(c.createdAt)
    for (const t of data.timeline ?? [])
      tally(t.createdAt)
    for (const commit of data.commits ?? [])
      tally(commit.committerDate ?? commit.authorDate)
    if (data.pull?.mergedAt)
      tally(data.pull.mergedAt)
  }

  return { buckets, total, days }
}

function startOfUtcDay(ms: number): number {
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY
}

/** True when `createdAt` parses to the same UTC day as `now`. */
export function isCreatedToday(createdAt: string | null | undefined, now = Date.now()): boolean {
  if (!createdAt)
    return false
  const ts = Date.parse(createdAt)
  if (Number.isNaN(ts))
    return false
  return startOfUtcDay(ts) === startOfUtcDay(now)
}
