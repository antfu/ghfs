import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { CLASSIFIER_ID, createFakeGateway, item, syncState } from '../test-support'
import { selectLabelTargets, suggestLabels, toLabelOps } from './index'

const repoLabels = [
  { name: 'bug', description: 'Something is broken' },
  { name: 'docs', description: null },
  { name: 'good first issue', description: null },
]

describe('selectLabelTargets', () => {
  const state = syncState([
    item(1),
    item(2, { labels: ['bug'] }),
    item(3, { state: 'closed' }, { state: 'closed' }),
  ])

  it('defaults to open unlabeled items', () => {
    expect(selectLabelTargets(state).map(i => i.number)).toEqual([1])
  })

  it('widens to every open item with `all`, and to explicit numbers regardless of state', () => {
    expect(selectLabelTargets(state, { all: true }).map(i => i.number)).toEqual([1, 2])
    expect(selectLabelTargets(state, { numbers: [3, 2] }).map(i => i.number)).toEqual([2, 3])
  })
})

describe('suggestLabels', () => {
  it('suggests confident labels from a single decision and skips excluded labels', async () => {
    const gateway = createFakeGateway([{ bug: 0.93, docs: 0.05 }])
    const config = { ...gateway.config, labeling: { ...gateway.config.labeling, exclude: ['good first issue'] } }
    const state = syncState([item(1, { title: 'Crash on start' }), item(2, { labels: ['bug'], title: 'Old crash' })])

    const suggestions = await suggestLabels({
      runtime: gateway.runtime,
      config,
      syncState: state,
      storageDirAbsolute: '/nonexistent',
      repoLabels,
      targets: selectLabelTargets(state),
    })

    expect(suggestions).toEqual([{ number: 1, labels: ['bug'], confidence: { bug: 0.93 }, model: CLASSIFIER_ID, escalated: false }])
    const request = gateway.requests[0]!
    expect(Object.keys(request.questions)).toEqual(['bug', 'docs'])
    expect(request.questions.bug!.type === 'bool' && request.questions.bug.criteria.true).toContain('"Old crash"')
    expect(request.state.title).toBe('Crash on start')
  })

  it('escalates to the agent when unsure, then re-decides with its notes', async () => {
    const gateway = createFakeGateway([{ bug: 0.5, docs: 0.1 }, { bug: 0.88, docs: 0.1 }])
    gateway.chat.setResponses([
      fauxAssistantMessage([fauxToolCall('read_comments', {})], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('submit_context', { notes: 'A maintainer reproduced the crash.' })], { stopReason: 'toolUse' }),
    ])
    const state = syncState([item(1)])
    const stages: string[] = []

    const suggestions = await suggestLabels({
      runtime: gateway.runtime,
      config: gateway.config,
      syncState: state,
      storageDirAbsolute: '/nonexistent',
      repoLabels,
      targets: selectLabelTargets(state),
      onProgress: event => stages.push(event.stage),
    })

    expect(suggestions).toEqual([{ number: 1, labels: ['bug'], confidence: { bug: 0.88 }, model: CLASSIFIER_ID, escalated: true }])
    expect(stages).toEqual(['deciding', 'investigating', 'done'])
    expect(gateway.requests[1]!.state.additionalContext).toBe('A maintainer reproduced the crash.')
    expect(gateway.chat.getPendingResponseCount()).toBe(0)
  })

  it('reports nothing for items whose passing labels are already applied', async () => {
    const gateway = createFakeGateway([{ bug: 0.95, docs: 0.2 }])
    const state = syncState([item(1, { labels: ['bug'] })])
    const done: Array<boolean> = []

    const suggestions = await suggestLabels({
      runtime: gateway.runtime,
      config: gateway.config,
      syncState: state,
      storageDirAbsolute: '/nonexistent',
      repoLabels,
      targets: selectLabelTargets(state, { all: true }),
      onProgress: event => event.stage === 'done' && done.push(event.suggestion !== undefined),
    })

    expect(suggestions).toEqual([])
    expect(done).toEqual([false])
  })
})

describe('toLabelOps', () => {
  it('turns suggestions into add-labels ops carrying their AI origin', () => {
    expect(toLabelOps([{ number: 7, labels: ['bug'], confidence: { bug: 0.9 }, model: CLASSIFIER_ID, escalated: false }])).toEqual([
      { action: 'add-labels', number: 7, labels: ['bug'], origin: { kind: 'ai', model: CLASSIFIER_ID, confidence: { bug: 0.9 } } },
    ])
  })
})
