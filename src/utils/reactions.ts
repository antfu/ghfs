import type { ProviderReactions } from '../types/provider'

const REACTION_KEYS = [
  'plusOne',
  'minusOne',
  'laugh',
  'hooray',
  'confused',
  'heart',
  'rocket',
  'eyes',
] as const

export type ReactionKey = typeof REACTION_KEYS[number]

/**
 * GitHub's wire format for reaction content (REST + GraphQL accept these
 * strings, sometimes uppercased in GraphQL). Order matches REACTION_KEYS.
 */
export const REACTION_CONTENTS = [
  '+1',
  '-1',
  'laugh',
  'hooray',
  'confused',
  'heart',
  'rocket',
  'eyes',
] as const

export type ReactionContent = typeof REACTION_CONTENTS[number]

export const REACTION_EMOJI: Record<ReactionContent, string> = {
  '+1': '👍',
  '-1': '👎',
  'laugh': '😄',
  'hooray': '🎉',
  'confused': '😕',
  'heart': '❤️',
  'rocket': '🚀',
  'eyes': '👀',
}

const CONTENT_TO_KEY: Record<ReactionContent, ReactionKey> = {
  '+1': 'plusOne',
  '-1': 'minusOne',
  'laugh': 'laugh',
  'hooray': 'hooray',
  'confused': 'confused',
  'heart': 'heart',
  'rocket': 'rocket',
  'eyes': 'eyes',
}

const KEY_TO_CONTENT: Record<ReactionKey, ReactionContent> = {
  plusOne: '+1',
  minusOne: '-1',
  laugh: 'laugh',
  hooray: 'hooray',
  confused: 'confused',
  heart: 'heart',
  rocket: 'rocket',
  eyes: 'eyes',
}

export function reactionKeyFromContent(content: ReactionContent): ReactionKey {
  return CONTENT_TO_KEY[content]
}

export function reactionContentFromKey(key: ReactionKey): ReactionContent {
  return KEY_TO_CONTENT[key]
}

export function isReactionContent(value: unknown): value is ReactionContent {
  return typeof value === 'string' && (REACTION_CONTENTS as readonly string[]).includes(value)
}

export function createEmptyReactions(): ProviderReactions {
  return {
    totalCount: 0,
    plusOne: 0,
    minusOne: 0,
    laugh: 0,
    hooray: 0,
    confused: 0,
    heart: 0,
    rocket: 0,
    eyes: 0,
  }
}

export function normalizeReactions(reactions: Partial<ProviderReactions> | undefined): ProviderReactions {
  const normalized = createEmptyReactions()
  if (!reactions)
    return normalized

  for (const key of REACTION_KEYS)
    normalized[key] = normalizeCount(reactions[key])

  const computedTotal = REACTION_KEYS.reduce((sum, key) => sum + normalized[key], 0)
  normalized.totalCount = Math.max(normalizeCount(reactions.totalCount), computedTotal)
  return normalized
}

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number')
    return 0
  if (!Number.isFinite(value))
    return 0
  if (value <= 0)
    return 0
  return Math.floor(value)
}
