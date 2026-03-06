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
