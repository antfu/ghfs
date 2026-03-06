import { describe, expect, it } from 'vitest'
import { createEmptyReactions, normalizeReactions } from './reactions'

describe('reactions', () => {
  it('creates an empty reactions object', () => {
    expect(createEmptyReactions()).toEqual({
      totalCount: 0,
      plusOne: 0,
      minusOne: 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    })
  })

  it('normalizes reaction counters and computes total fallback', () => {
    expect(normalizeReactions({
      plusOne: 3,
      minusOne: -1,
      laugh: 1.8,
      totalCount: 1,
    })).toEqual({
      totalCount: 4,
      plusOne: 3,
      minusOne: 0,
      laugh: 1,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    })
  })
})
