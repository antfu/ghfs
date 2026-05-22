import type { CardsPileState } from './rpc/types'

/**
 * Pile state lives in-memory on the server so the client can refresh `/cards`
 * without losing progress. It is intentionally *not* persisted to disk — a
 * server restart starts the user fresh, which is fine because the pile is
 * always re-pickable from the current sync state.
 */
let current: CardsPileState | null = null

export function getCardsPile(): CardsPileState | null {
  return current
}

export function setCardsPile(next: CardsPileState | null): void {
  current = next
}

export function clearCardsPile(): void {
  current = null
}
