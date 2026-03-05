import type { SyncOptions } from '../sync/contracts'
import type { SyncState } from '../types'

export function resolveSince(options: SyncOptions, syncState: SyncState): string | undefined {
  if (options.full)
    return undefined
  if (options.since)
    return options.since
  return syncState.lastSyncedAt
}

export function normalizeIssueNumbers(numbers: number[] | undefined): number[] | undefined {
  if (!numbers)
    return undefined
  return [...new Set(numbers.filter(number => Number.isInteger(number) && number > 0))]
}
