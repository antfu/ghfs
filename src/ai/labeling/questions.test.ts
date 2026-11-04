import type { ProviderItem } from '../../types/provider'
import type { SyncItemState } from '../../types/sync-state'
import { describe, expect, it } from 'vitest'
import { buildItemState, buildLabelQuestions, ITEM_BODY_LIMIT, pickLabels, sampleLabelExamples, uncertainLabels } from './questions'

function item(number: number, overrides: Partial<ProviderItem> = {}): SyncItemState {
  const data: ProviderItem = {
    number,
    kind: 'issue',
    url: `https://github.com/o/r/issues/${number}`,
    state: 'open',
    stateReason: null,
    updatedAt: `2026-01-${String(number).padStart(2, '0')}T00:00:00Z`,
    createdAt: '2026-01-01T00:00:00Z',
    closedAt: null,
    title: `Issue ${number}`,
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
    filePath: `issues/${number}.md`,
    data: { item: data, comments: [] },
  }
}

describe('sampleLabelExamples', () => {
  it('takes the newest titles per label and skips excluded items', () => {
    const items = [
      item(1, { labels: ['bug'] }),
      item(2, { labels: ['bug', 'docs'] }),
      item(3, { labels: ['bug'] }),
      item(4, { labels: ['bug'] }),
    ]
    const examples = sampleLabelExamples(items, [{ name: 'bug', description: null }, { name: 'docs', description: null }, { name: 'feat', description: null }], 2, new Set([4]))
    expect(examples).toEqual({
      bug: ['Issue 3', 'Issue 2'],
      docs: ['Issue 2'],
      feat: [],
    })
  })
})

describe('buildLabelQuestions', () => {
  it('folds description and examples into the true criterion', () => {
    const questions = buildLabelQuestions(
      [{ name: 'bug', description: 'Something is broken' }, { name: 'docs', description: null }],
      { bug: ['Crash on start'], docs: [] },
    )
    expect(questions.bug).toEqual({
      type: 'bool',
      instructions: 'Should this item carry the label "bug"?',
      criteria: {
        true: 'Belongs under "bug": Something is broken. Items already carrying this label: "Crash on start".',
        false: 'Does not belong under "bug".',
      },
    })
    expect(questions.docs!.criteria.true).toBe('Belongs under "docs".')
  })
})

describe('buildItemState', () => {
  it('truncates long bodies and only includes optional fields when present', () => {
    const base = item(1, { body: 'x'.repeat(ITEM_BODY_LIMIT + 10), kind: 'pull' }).data.item
    const state = buildItemState(base)
    expect(state.kind).toBe('pull request')
    expect(String(state.body)).toHaveLength(ITEM_BODY_LIMIT + '\n(truncated)'.length)
    expect(state).not.toHaveProperty('labelingGuidelines')
    expect(state).not.toHaveProperty('currentLabels')

    const withExtras = buildItemState(item(2, { labels: ['bug'] }).data.item, { guidelines: 'Be strict', notes: 'Reproduced' })
    expect(withExtras.currentLabels).toEqual(['bug'])
    expect(withExtras.labelingGuidelines).toBe('Be strict')
    expect(withExtras.additionalContext).toBe('Reproduced')
  })
})

describe('pickLabels / uncertainLabels', () => {
  const probabilities = { bug: 0.91, docs: 0.5, feat: 0.12, perf: 0.7 }

  it('keeps labels at or above the threshold, highest first, with rounded confidence', () => {
    expect(pickLabels(probabilities, 0.7)).toEqual({
      labels: ['bug', 'perf'],
      confidence: { bug: 0.91, perf: 0.7 },
    })
    expect(pickLabels({ bug: 0.123456 }, 0.1).confidence).toEqual({ bug: 0.12 })
  })

  it('flags labels between half the threshold and the threshold as uncertain', () => {
    expect(uncertainLabels(probabilities, 0.7)).toEqual(['docs'])
    expect(uncertainLabels({ a: 0.1, b: 0.95 }, 0.7)).toEqual([])
  })
})
