import { describe, expect, it } from 'vitest'
import {
  createEmptyReactions,
  isReactionContent,
  normalizeReactions,
  REACTION_CONTENTS,
  REACTION_EMOJI,
  reactionContentFromKey,
  reactionKeyFromContent,
} from './reactions'

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

  it('exposes the 8 GitHub reaction wire contents', () => {
    expect(REACTION_CONTENTS).toEqual(['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'])
  })

  it('maps content to internal key and back', () => {
    expect(reactionKeyFromContent('+1')).toBe('plusOne')
    expect(reactionKeyFromContent('-1')).toBe('minusOne')
    expect(reactionKeyFromContent('heart')).toBe('heart')
    expect(reactionContentFromKey('plusOne')).toBe('+1')
    expect(reactionContentFromKey('minusOne')).toBe('-1')
    expect(reactionContentFromKey('eyes')).toBe('eyes')
  })

  it('round-trips every key through content', () => {
    for (const content of REACTION_CONTENTS)
      expect(reactionContentFromKey(reactionKeyFromContent(content))).toBe(content)
  })

  it('provides an emoji for every content', () => {
    for (const content of REACTION_CONTENTS)
      expect(REACTION_EMOJI[content]).toMatch(/\S/)
  })

  it('isReactionContent accepts wire contents and rejects others', () => {
    expect(isReactionContent('+1')).toBe(true)
    expect(isReactionContent('heart')).toBe(true)
    expect(isReactionContent('thumbs_up')).toBe(false)
    expect(isReactionContent('plusOne')).toBe(false)
    expect(isReactionContent(null)).toBe(false)
    expect(isReactionContent(42)).toBe(false)
  })
})
