import type { QueueEntry } from '#ghfs/server-types'
import type { PendingOp } from '../../src/execute/types'

export type PendingDirection = 'close' | 'reopen' | null

export interface PendingItemState {
  /** All queue entries targeting this number. */
  entries: ComputedRef<QueueEntry[]>
  /** 'close' if a close/close-with-comment is pending, 'reopen' if reopen is pending, else null. */
  direction: ComputedRef<PendingDirection>
  /** Pending add-comment / close-with-comment ops (rendered as dashed-outlined pending comments). */
  pendingComments: ComputedRef<QueueEntry[]>
  /** Pending set-title op. */
  pendingTitle: ComputedRef<QueueEntry | null>
  /** Other pending ops (labels/assignees/milestone/etc.) for display. */
  pendingOther: ComputedRef<QueueEntry[]>
  /** True when anything is pending for this item. */
  hasPending: ComputedRef<boolean>
}

const CLOSE_ACTIONS = new Set(['close', 'close-with-comment'])

export function usePendingOps(numberRef: Ref<number | null | undefined>): PendingItemState {
  const state = useAppState()

  const entries = computed<QueueEntry[]>(() => {
    const num = numberRef.value
    if (num == null)
      return []
    const all = state.payload.value?.queue.entries ?? []
    return all.filter(e => e.op.number === num)
  })

  const direction = computed<PendingDirection>(() => {
    const list = entries.value
    if (list.some(e => CLOSE_ACTIONS.has(e.op.action)))
      return 'close'
    if (list.some(e => e.op.action === 'reopen'))
      return 'reopen'
    return null
  })

  const pendingComments = computed<QueueEntry[]>(() =>
    entries.value.filter(e => e.op.action === 'add-comment' || e.op.action === 'close-with-comment'),
  )

  const pendingTitle = computed<QueueEntry | null>(() =>
    entries.value.find(e => e.op.action === 'set-title') ?? null,
  )

  const pendingOther = computed<QueueEntry[]>(() => {
    const skip = new Set(['close', 'reopen', 'close-with-comment', 'add-comment', 'set-title'])
    return entries.value.filter(e => !skip.has(e.op.action))
  })

  const hasPending = computed(() => entries.value.length > 0)

  return {
    entries,
    direction,
    pendingComments,
    pendingTitle,
    pendingOther,
    hasPending,
  }
}

/**
 * Given a raw ProviderItem state ('open' | 'closed'), return the effective
 * state taking a pending close/reopen into account.
 */
export function applyPendingState(raw: 'open' | 'closed', direction: PendingDirection): 'open' | 'closed' {
  if (direction === 'close') return 'closed'
  if (direction === 'reopen') return 'open'
  return raw
}

/** Extract a string from a pending op that carries one (body / title). */
export function getOpBody(op: PendingOp): string | null {
  if ('body' in op && typeof op.body === 'string')
    return op.body
  return null
}
