import type { PendingLockOp, PendingOp } from './types'

type LockReason = PendingLockOp['reason']

interface LabelChanges {
  /** When `mode === 'set'`, `set` is authoritative and add/remove are ignored. */
  mode: 'set' | 'delta'
  set: string[]
  add: string[]
  remove: string[]
}

interface AssigneeChanges {
  mode: 'set' | 'delta'
  set: string[]
  add: string[]
  remove: string[]
}

interface ReviewerChanges {
  add: string[]
  remove: string[]
}

interface ItemState {
  title: string | null
  body: string | null
  /** null = no change, {kind:'close', body?} = close (optionally bundled), {kind:'reopen'} = reopen. */
  stateChange: { kind: 'close', body?: string } | { kind: 'reopen' } | null
  /** Standalone add-comment bodies, deduped and order-preserving. */
  extraComments: string[]
  labels: LabelChanges
  assignees: AssigneeChanges
  reviewers: ReviewerChanges
  milestone: { set: string | number } | 'clear' | null
  lock: { lock: true, reason?: LockReason } | { lock: false } | null
  draft: 'draft' | 'ready' | null
  /** Earliest ifUnchangedSince across all ops in the group (most conservative). */
  ifUnchangedSince: string | undefined
}

function createEmptyState(): ItemState {
  return {
    title: null,
    body: null,
    stateChange: null,
    extraComments: [],
    labels: { mode: 'delta', set: [], add: [], remove: [] },
    assignees: { mode: 'delta', set: [], add: [], remove: [] },
    reviewers: { add: [], remove: [] },
    milestone: null,
    lock: null,
    draft: null,
    ifUnchangedSince: undefined,
  }
}

function addUnique(list: string[], value: string): void {
  if (!list.includes(value))
    list.push(value)
}

function removeFromList(list: string[], value: string): void {
  const idx = list.indexOf(value)
  if (idx >= 0)
    list.splice(idx, 1)
}

function mergeIfUnchangedSince(current: string | undefined, next: string | undefined): string | undefined {
  if (!next)
    return current
  if (!current)
    return next
  try {
    return new Date(next).getTime() < new Date(current).getTime() ? next : current
  }
  catch {
    return current
  }
}

function applyOp(state: ItemState, op: PendingOp): void {
  state.ifUnchangedSince = mergeIfUnchangedSince(state.ifUnchangedSince, op.ifUnchangedSince)

  switch (op.action) {
    case 'close': {
      if (state.stateChange?.kind === 'reopen') {
        // reopen + close → cancel (net no-op)
        state.stateChange = null
        break
      }
      const body = state.stateChange?.kind === 'close' ? state.stateChange.body : undefined
      state.stateChange = body ? { kind: 'close', body } : { kind: 'close' }
      break
    }
    case 'reopen': {
      if (state.stateChange?.kind === 'close') {
        // close (optionally bundled) + reopen → cancel; the body is dropped
        state.stateChange = null
        break
      }
      state.stateChange = { kind: 'reopen' }
      break
    }
    case 'close-with-comment': {
      if (state.stateChange?.kind === 'reopen') {
        // reopen + close-with-comment → cancel state change but keep the comment
        addUnique(state.extraComments, op.body)
        state.stateChange = null
        break
      }
      if (state.stateChange?.kind === 'close' && state.stateChange.body && state.stateChange.body !== op.body)
        addUnique(state.extraComments, state.stateChange.body)
      state.stateChange = { kind: 'close', body: op.body }
      break
    }
    case 'set-title':
      state.title = op.title
      break
    case 'set-body':
      state.body = op.body
      break
    case 'add-comment': {
      if (state.stateChange?.kind === 'close' && state.stateChange.body === op.body)
        break
      addUnique(state.extraComments, op.body)
      break
    }
    case 'add-labels': {
      if (state.labels.mode === 'set') {
        for (const l of op.labels)
          addUnique(state.labels.set, l)
      }
      else {
        for (const l of op.labels) {
          if (state.labels.remove.includes(l))
            removeFromList(state.labels.remove, l)
          else
            addUnique(state.labels.add, l)
        }
      }
      break
    }
    case 'remove-labels': {
      if (state.labels.mode === 'set') {
        state.labels.set = state.labels.set.filter(l => !op.labels.includes(l))
      }
      else {
        for (const l of op.labels) {
          if (state.labels.add.includes(l))
            removeFromList(state.labels.add, l)
          else
            addUnique(state.labels.remove, l)
        }
      }
      break
    }
    case 'set-labels':
      state.labels = { mode: 'set', set: [...op.labels], add: [], remove: [] }
      break
    case 'add-assignees': {
      if (state.assignees.mode === 'set') {
        for (const a of op.assignees)
          addUnique(state.assignees.set, a)
      }
      else {
        for (const a of op.assignees) {
          if (state.assignees.remove.includes(a))
            removeFromList(state.assignees.remove, a)
          else
            addUnique(state.assignees.add, a)
        }
      }
      break
    }
    case 'remove-assignees': {
      if (state.assignees.mode === 'set') {
        state.assignees.set = state.assignees.set.filter(a => !op.assignees.includes(a))
      }
      else {
        for (const a of op.assignees) {
          if (state.assignees.add.includes(a))
            removeFromList(state.assignees.add, a)
          else
            addUnique(state.assignees.remove, a)
        }
      }
      break
    }
    case 'set-assignees':
      state.assignees = { mode: 'set', set: [...op.assignees], add: [], remove: [] }
      break
    case 'set-milestone':
      state.milestone = { set: op.milestone }
      break
    case 'clear-milestone':
      state.milestone = 'clear'
      break
    case 'lock':
      state.lock = { lock: true, reason: op.reason }
      break
    case 'unlock':
      state.lock = state.lock?.lock === true ? null : { lock: false }
      break
    case 'convert-to-draft':
      state.draft = state.draft === 'ready' ? null : 'draft'
      break
    case 'mark-ready-for-review':
      state.draft = state.draft === 'draft' ? null : 'ready'
      break
    case 'request-reviewers': {
      for (const r of op.reviewers) {
        if (state.reviewers.remove.includes(r))
          removeFromList(state.reviewers.remove, r)
        else
          addUnique(state.reviewers.add, r)
      }
      break
    }
    case 'remove-reviewers': {
      for (const r of op.reviewers) {
        if (state.reviewers.add.includes(r))
          removeFromList(state.reviewers.add, r)
        else
          addUnique(state.reviewers.remove, r)
      }
      break
    }
  }
}

function emit(number: number, state: ItemState): PendingOp[] {
  const ifUnchangedSince = state.ifUnchangedSince
  const withBase = <T extends PendingOp>(op: T): T => (ifUnchangedSince ? { ...op, ifUnchangedSince } : op)
  const out: PendingOp[] = []

  if (state.title != null)
    out.push(withBase({ action: 'set-title', number, title: state.title }))

  if (state.body != null)
    out.push(withBase({ action: 'set-body', number, body: state.body }))

  if (state.labels.mode === 'set') {
    out.push(withBase({ action: 'set-labels', number, labels: [...state.labels.set] }))
  }
  else {
    if (state.labels.add.length)
      out.push(withBase({ action: 'add-labels', number, labels: [...state.labels.add] }))
    if (state.labels.remove.length)
      out.push(withBase({ action: 'remove-labels', number, labels: [...state.labels.remove] }))
  }

  if (state.assignees.mode === 'set') {
    out.push(withBase({ action: 'set-assignees', number, assignees: [...state.assignees.set] }))
  }
  else {
    if (state.assignees.add.length)
      out.push(withBase({ action: 'add-assignees', number, assignees: [...state.assignees.add] }))
    if (state.assignees.remove.length)
      out.push(withBase({ action: 'remove-assignees', number, assignees: [...state.assignees.remove] }))
  }

  if (state.milestone === 'clear')
    out.push(withBase({ action: 'clear-milestone', number }))
  else if (state.milestone && 'set' in state.milestone)
    out.push(withBase({ action: 'set-milestone', number, milestone: state.milestone.set }))

  if (state.reviewers.add.length)
    out.push(withBase({ action: 'request-reviewers', number, reviewers: [...state.reviewers.add] }))
  if (state.reviewers.remove.length)
    out.push(withBase({ action: 'remove-reviewers', number, reviewers: [...state.reviewers.remove] }))

  if (state.draft === 'draft')
    out.push(withBase({ action: 'convert-to-draft', number }))
  else if (state.draft === 'ready')
    out.push(withBase({ action: 'mark-ready-for-review', number }))

  for (const body of state.extraComments)
    out.push(withBase({ action: 'add-comment', number, body }))

  if (state.stateChange?.kind === 'close') {
    if (state.stateChange.body != null)
      out.push(withBase({ action: 'close-with-comment', number, body: state.stateChange.body }))
    else
      out.push(withBase({ action: 'close', number }))
  }
  else if (state.stateChange?.kind === 'reopen') {
    out.push(withBase({ action: 'reopen', number }))
  }

  if (state.lock?.lock === true)
    out.push(withBase({ action: 'lock', number, ...(state.lock.reason ? { reason: state.lock.reason } : {}) }))
  else if (state.lock?.lock === false)
    out.push(withBase({ action: 'unlock', number }))

  return out
}

/**
 * Compress a list of pending ops by merging/cancelling redundant ones per-item.
 *
 * - `close` + `reopen` cancel each other.
 * - `close-with-comment("a")` + `close-with-comment("b")` keeps "b" bundled and demotes "a" to a standalone add-comment.
 * - `close-with-comment("a")` + `reopen` cancels entirely (the body is dropped — if users want to keep the comment they can add it explicitly).
 * - Adjacent `add-labels` / `remove-labels` merge; overlapping pairs cancel out.
 * - `set-title` / `set-body` / `set-labels` / `set-assignees` / `set-milestone` / `clear-milestone` follow last-write-wins.
 * - `add-comment` bodies dedupe.
 * - `lock`/`unlock` and `convert-to-draft`/`mark-ready-for-review` cancel when paired in that order.
 * - `ifUnchangedSince` is preserved as the earliest (most conservative) value across ops in the group.
 *
 * Groups are emitted in the order their number first appeared in the input.
 */
export function compressOps(ops: PendingOp[]): PendingOp[] {
  const groups = new Map<number, { order: number, list: PendingOp[] }>()
  let order = 0
  for (const op of ops) {
    let entry = groups.get(op.number)
    if (!entry) {
      entry = { order: order++, list: [] }
      groups.set(op.number, entry)
    }
    entry.list.push(op)
  }

  const sorted = [...groups.entries()].sort((a, b) => a[1].order - b[1].order)
  const result: PendingOp[] = []
  for (const [number, { list }] of sorted) {
    const state = createEmptyState()
    for (const op of list)
      applyOp(state, op)
    result.push(...emit(number, state))
  }
  return result
}
