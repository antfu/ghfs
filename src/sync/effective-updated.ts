import type { SyncItemState } from '../types/sync-state'
import { isBotLogin } from '../utils/bot'

/**
 * Last updated timestamp for sort order, ignoring bot-only activity.
 *
 * Walks the item's comments, timeline events, and commits and returns the
 * latest timestamp from a non-bot actor. Falls back to GitHub's
 * `item.updatedAt` when no human activity is recorded so bot-only items
 * (e.g. a fresh Dependabot PR) still surface.
 *
 * ISO-8601 strings sort lexicographically — no Date parsing needed.
 */
export function getEffectiveUpdatedAt(
  entry: SyncItemState,
  extraBots: readonly string[] = [],
): string {
  const data = entry.data
  let best: string | undefined

  const consider = (ts: string | null | undefined): void => {
    if (!ts)
      return
    if (!best || ts > best)
      best = ts
  }

  for (const c of data.comments ?? []) {
    if (isBotLogin(c.author, extraBots))
      continue
    consider(c.updatedAt)
    consider(c.createdAt)
  }
  for (const t of data.timeline ?? []) {
    if (isBotLogin(t.actor, extraBots))
      continue
    consider(t.createdAt)
  }
  for (const commit of data.commits ?? []) {
    if (isBotLogin(commit.committerLogin, extraBots))
      continue
    consider(commit.committerDate ?? commit.authorDate)
  }

  return best ?? data.item.updatedAt
}
