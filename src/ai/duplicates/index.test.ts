import { describe, expect, it } from 'vitest'
import { createFakeGateway, item } from '../test-support'
import { detectDuplicates, selectDuplicateCandidates } from './index'

describe('selectDuplicateCandidates', () => {
  it('pairs open items of the same kind by title overlap or overlap plus a shared label', () => {
    const items = [
      item(1, { title: 'CLI crashes on startup' }),
      item(2, { title: 'Crash during CLI startup' }),
      item(3, { title: 'CLI help text typo', labels: ['cli'] }),
      item(4, { title: 'Hub shows CLI version', labels: ['cli'] }),
      item(5, { title: 'CLI crashes on startup', kind: 'pull' }),
      item(6, { title: 'CLI crashes on startup', state: 'closed' }, { state: 'closed' }),
    ]
    expect(selectDuplicateCandidates(items)).toEqual([
      { a: 1, b: 2, score: 2 },
      { a: 3, b: 4, score: 2 },
    ])
  })

  it('caps the number of candidates by score', () => {
    const items = [1, 2, 3].map(n => item(n, { title: 'Same words every time' }))
    expect(selectDuplicateCandidates(items, 1)).toHaveLength(1)
  })
})

describe('detectDuplicates', () => {
  it('batches pairs into one state per request and keeps likely pairs sorted by probability', async () => {
    const gateway = createFakeGateway([{ p0: 0.2, p1: 0.93 }])
    const items = [item(1, { title: 'A' }), item(2, { title: 'B' }), item(3, { title: 'C' }), item(4, { title: 'D' })]
    const progress: Array<[number, number]> = []

    const pairs = await detectDuplicates(gateway.runtime, items, [{ a: 1, b: 2, score: 2 }, { a: 3, b: 4, score: 2 }], {
      onProgress: (done, total) => progress.push([done, total]),
    })

    expect(pairs).toEqual([{ a: 3, b: 4, probability: 0.93 }])
    expect(progress).toEqual([[2, 2]])
    const request = gateway.requests[0]!
    expect(Object.keys(request.questions)).toEqual(['p0', 'p1'])
    expect((request.state.pairs as Record<string, { a: { number: number }, b: { number: number } }>).p1).toMatchObject({ a: { number: 3 }, b: { number: 4 } })
  })
})
