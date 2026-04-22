import type { PendingOp } from './types'
import { describe, expect, it } from 'vitest'
import { compressOps } from './compress'

describe('compressOps', () => {
  it('returns an empty list unchanged', () => {
    expect(compressOps([])).toEqual([])
  })

  it('preserves ops on distinct numbers without merging', () => {
    const ops: PendingOp[] = [
      { action: 'close', number: 1 },
      { action: 'close', number: 2 },
    ]
    expect(compressOps(ops)).toEqual(ops)
  })

  it('cancels close + reopen on the same number', () => {
    const ops: PendingOp[] = [
      { action: 'close', number: 5 },
      { action: 'reopen', number: 5 },
    ]
    expect(compressOps(ops)).toEqual([])
  })

  it('dedupes repeated close', () => {
    const ops: PendingOp[] = [
      { action: 'close', number: 5 },
      { action: 'close', number: 5 },
    ]
    expect(compressOps(ops)).toEqual([{ action: 'close', number: 5 }])
  })

  it('keeps the last set-title and drops earlier ones', () => {
    const ops: PendingOp[] = [
      { action: 'set-title', number: 1, title: 'first' },
      { action: 'set-title', number: 1, title: 'second' },
      { action: 'set-title', number: 1, title: 'third' },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'set-title', number: 1, title: 'third' },
    ])
  })

  it('merges consecutive add-labels for the same number', () => {
    const ops: PendingOp[] = [
      { action: 'add-labels', number: 1, labels: ['bug'] },
      { action: 'add-labels', number: 1, labels: ['triage', 'bug'] },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'add-labels', number: 1, labels: ['bug', 'triage'] },
    ])
  })

  it('cancels add-labels/remove-labels overlap and keeps net changes', () => {
    const ops: PendingOp[] = [
      { action: 'add-labels', number: 1, labels: ['a', 'b'] },
      { action: 'remove-labels', number: 1, labels: ['b', 'c'] },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'add-labels', number: 1, labels: ['a'] },
      { action: 'remove-labels', number: 1, labels: ['c'] },
    ])
  })

  it('eliminates the entire label change when add/remove overlap exactly', () => {
    const ops: PendingOp[] = [
      { action: 'add-labels', number: 1, labels: ['bug'] },
      { action: 'remove-labels', number: 1, labels: ['bug'] },
    ]
    expect(compressOps(ops)).toEqual([])
  })

  it('applies add/remove onto a prior set-labels in set-mode', () => {
    const ops: PendingOp[] = [
      { action: 'set-labels', number: 1, labels: ['a', 'b'] },
      { action: 'add-labels', number: 1, labels: ['c'] },
      { action: 'remove-labels', number: 1, labels: ['a'] },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'set-labels', number: 1, labels: ['b', 'c'] },
    ])
  })

  it('promotes close-with-comment after reopen (cancels fully, body is dropped)', () => {
    const ops: PendingOp[] = [
      { action: 'close-with-comment', number: 1, body: 'done' },
      { action: 'reopen', number: 1 },
    ]
    expect(compressOps(ops)).toEqual([])
  })

  it('demotes the earlier body to a standalone comment when two close-with-comment stack', () => {
    const ops: PendingOp[] = [
      { action: 'close-with-comment', number: 1, body: 'first note' },
      { action: 'close-with-comment', number: 1, body: 'final note' },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'add-comment', number: 1, body: 'first note' },
      { action: 'close-with-comment', number: 1, body: 'final note' },
    ])
  })

  it('dedupes identical add-comment bodies and preserves order of distinct ones', () => {
    const ops: PendingOp[] = [
      { action: 'add-comment', number: 1, body: 'a' },
      { action: 'add-comment', number: 1, body: 'b' },
      { action: 'add-comment', number: 1, body: 'a' },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'add-comment', number: 1, body: 'a' },
      { action: 'add-comment', number: 1, body: 'b' },
    ])
  })

  it('cancels lock followed by unlock on the same number', () => {
    const ops: PendingOp[] = [
      { action: 'lock', number: 1 },
      { action: 'unlock', number: 1 },
    ]
    expect(compressOps(ops)).toEqual([])
  })

  it('cancels convert-to-draft + mark-ready-for-review', () => {
    const ops: PendingOp[] = [
      { action: 'convert-to-draft', number: 1 },
      { action: 'mark-ready-for-review', number: 1 },
    ]
    expect(compressOps(ops)).toEqual([])
  })

  it('emits titles, labels, and state in canonical order', () => {
    const ops: PendingOp[] = [
      { action: 'close', number: 7 },
      { action: 'add-labels', number: 7, labels: ['fix'] },
      { action: 'set-title', number: 7, title: 'new title' },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'set-title', number: 7, title: 'new title' },
      { action: 'add-labels', number: 7, labels: ['fix'] },
      { action: 'close', number: 7 },
    ])
  })

  it('preserves the earliest ifUnchangedSince across merged ops', () => {
    const ops: PendingOp[] = [
      { action: 'add-labels', number: 1, labels: ['a'], ifUnchangedSince: '2026-02-01T00:00:00Z' },
      { action: 'add-labels', number: 1, labels: ['b'], ifUnchangedSince: '2026-01-01T00:00:00Z' },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'add-labels', number: 1, labels: ['a', 'b'], ifUnchangedSince: '2026-01-01T00:00:00Z' },
    ])
  })

  it('orders groups by first appearance of the number', () => {
    const ops: PendingOp[] = [
      { action: 'close', number: 2 },
      { action: 'close', number: 1 },
      { action: 'set-title', number: 2, title: 't' },
    ]
    expect(compressOps(ops)).toEqual([
      { action: 'set-title', number: 2, title: 't' },
      { action: 'close', number: 2 },
      { action: 'close', number: 1 },
    ])
  })
})
