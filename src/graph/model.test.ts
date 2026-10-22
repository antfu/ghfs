import type { ProviderItem, ProviderTimelineEvent } from '../types/provider'
import type { SyncItemState, SyncState } from '../types/sync-state'
import { describe, expect, it } from 'vitest'
import { buildGraphModel, collectItemReferences, UNLABELED_NODE_ID } from './model'

interface ItemOptions extends Partial<ProviderItem> {
  timeline?: ProviderTimelineEvent[]
  merged?: boolean
}

function item(number: number, { timeline, merged, ...overrides }: ItemOptions = {}): SyncItemState {
  const data: ProviderItem = {
    number,
    kind: 'issue',
    url: '',
    state: 'open',
    stateReason: null,
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    closedAt: null,
    title: `Item ${number}`,
    body: '',
    author: 'alice',
    labels: [],
    assignees: [],
    milestone: null,
    ...overrides,
  }
  return {
    number,
    kind: data.kind,
    state: data.state,
    lastUpdatedAt: data.updatedAt,
    lastSyncedAt: data.updatedAt,
    filePath: '',
    data: {
      item: data,
      comments: [],
      timeline,
      ...(data.kind === 'pull' ? { pull: { isDraft: false, merged: merged ?? false, mergedAt: null, baseRef: 'main', headRef: 'x', requestedReviewers: [] } } : {}),
    },
  }
}

function event(kind: ProviderTimelineEvent['kind'], extra: Record<string, unknown> = {}): ProviderTimelineEvent {
  return { id: `${kind}-${Math.random()}`, createdAt: '2026-01-01T00:00:00Z', actor: 'alice', kind, ...extra } as ProviderTimelineEvent
}

function state(items: SyncItemState[]): SyncState {
  return { version: 2, executions: [], items: Object.fromEntries(items.map(i => [String(i.number), i])) }
}

const labels = [{ name: 'bug', color: 'd73a4a' }]

describe('collectItemReferences', () => {
  it('reads timeline links and body mentions, typed by how they were made', () => {
    const pull = item(10, {
      kind: 'pull',
      body: 'Fixes #3 and mentions #4. Not a ref: &#39;',
      timeline: [
        event('marked_as_duplicate', { source: { number: 5, kind: 'issue' } }),
        event('cross-referenced', { source: { number: 6, kind: 'issue' } }),
        event('cross-referenced', { source: { number: 7, kind: 'issue', repo: 'other/repo' } }),
        event('connected', { source: { number: 8, kind: 'issue' } }),
      ],
    })
    expect(collectItemReferences(pull)).toEqual([
      { number: 5, kind: 'duplicate' },
      { number: 6, kind: 'reference' },
      { number: 8, kind: 'closes' },
      { number: 3, kind: 'closes' },
      { number: 4, kind: 'reference' },
    ])
  })

  it('treats `fixes #N` in an issue body as a plain reference', () => {
    expect(collectItemReferences(item(1, { body: 'fixes #2' }))).toEqual([{ number: 2, kind: 'reference' }])
  })
})

describe('buildGraphModel', () => {
  it('links items to label anchors and the unlabeled anchor', () => {
    const model = buildGraphModel(state([item(1, { labels: ['bug'] }), item(2)]), { labels })
    expect(model.nodes.map(n => n.id)).toEqual(['#1', '#2', 'label:bug', UNLABELED_NODE_ID])
    expect(model.nodes.find(n => n.id === 'label:bug')).toMatchObject({ kind: 'label', name: 'bug', color: 'd73a4a' })
    expect(model.edges).toEqual([
      { source: '#1', target: 'label:bug', kind: 'label' },
      { source: '#2', target: UNLABELED_NODE_ID, kind: 'label' },
    ])
  })

  it('orients closes edges pull → issue and dedupes links recorded on both sides', () => {
    const issue = item(1, { timeline: [event('cross-referenced', { source: { number: 2, kind: 'pull' } })] })
    const pull = item(2, { kind: 'pull', body: 'closes #1', timeline: [event('cross-referenced', { source: { number: 1, kind: 'issue' } })] })
    const model = buildGraphModel(state([issue, pull]), { labels })
    const itemEdges = model.edges.filter(e => e.kind !== 'label')
    expect(itemEdges).toEqual([
      { source: '#1', target: '#2', kind: 'reference' },
      { source: '#2', target: '#1', kind: 'closes' },
    ])
  })

  it('groups items closed by the same commit and attaches the merged pull', () => {
    const sha = 'abc'
    const a = item(1, { state: 'closed', timeline: [event('closed', { sha })] })
    const b = item(2, { state: 'closed', timeline: [event('closed', { sha })] })
    const pull = item(3, { kind: 'pull', state: 'closed', merged: true, timeline: [event('merged', { sha })] })
    const model = buildGraphModel(state([a, b, pull]), { labels, includeClosed: true })
    expect(model.edges.filter(e => e.kind !== 'label')).toEqual([
      { source: '#3', target: '#1', kind: 'closes' },
      { source: '#3', target: '#2', kind: 'closes' },
      { source: '#1', target: '#2', kind: 'closed-together' },
    ])
  })

  it('hides closed items unless they are linked to an open one', () => {
    const closedLinked = item(1, { state: 'closed' })
    const closedAlone = item(2, { state: 'closed', timeline: [event('cross-referenced', { source: { number: 1, kind: 'issue' } })] })
    const open = item(3, { timeline: [event('cross-referenced', { source: { number: 1, kind: 'issue' } })] })
    const model = buildGraphModel(state([closedLinked, closedAlone, open]), { labels })
    expect(model.nodes.filter(n => n.kind === 'item').map(n => n.id)).toEqual(['#1', '#3'])
    expect(model.edges.filter(e => e.kind !== 'label')).toEqual([
      { source: '#3', target: '#1', kind: 'reference' },
    ])
  })

  it('shows every closed item with includeClosed', () => {
    const model = buildGraphModel(state([item(1, { state: 'closed' }), item(2)]), { labels, includeClosed: true })
    expect(model.nodes.filter(n => n.kind === 'item').map(n => n.id)).toEqual(['#1', '#2'])
  })
})
