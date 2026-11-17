import { describe, expect, it, vi } from 'vitest'
import type { CardsPileState, CardsSharedState } from '../../src/devframe/rpc/types'
import type { ListItem } from '../types/list-item'
import { DEFAULT_PILE_OPTIONS, useCardsMode } from './useCardsMode'

type Listener = (next: CardsSharedState) => void

const shared = vi.hoisted(() => {
  const listeners = new Set<Listener>()
  const handle = {
    current: { pile: null } as CardsSharedState,
    value(): CardsSharedState {
      return this.current
    },
    on(_event: 'updated', fn: Listener): () => void {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    mutate(recipe: (draft: CardsSharedState) => void): void {
      recipe(this.current)
      for (const fn of listeners)
        fn(this.current)
    },
    emit(next: CardsSharedState): void {
      this.current = next
      for (const fn of listeners)
        fn(next)
    },
  }
  let resolveGet: (state: typeof handle) => void = () => {}
  const pendingGet = new Promise<typeof handle>((resolve) => {
    resolveGet = resolve
  })
  return { handle, pendingGet, resolveGet }
})

vi.mock('#imports', () => ({
  useRouter: () => ({
    currentRoute: { value: { path: '/' } },
    push: async () => {},
  }),
  useRoute: () => ({ path: '/' }),
}))

vi.mock('./useRpc', () => ({
  useRpcClient: async () => ({
    sharedState: {
      get: () => shared.pendingGet,
    },
  }),
}))

vi.mock('./useSeenHistory', () => ({
  useSeenHistory: () => ({ getSeenEntry: () => undefined }),
}))

vi.mock('./useUiState', () => ({
  useUiState: () => ({
    isTodo: () => false,
    isIgnored: () => false,
  }),
}))

vi.mock('./useProjectPayload', () => ({
  useProjectPayload: () => ({ ensureLoaded: async () => {} }),
}))

function item(number: number): ListItem {
  return {
    key: `p-issue-${number}`,
    projectId: 'p',
    repo: 'o/r',
    kind: 'issue',
    number,
    title: `Issue ${number}`,
    state: 'open',
    author: 'octocat',
    updatedAt: `2026-01-0${number}T00:00:00.000Z`,
  }
}

const emptyPile: CardsPileState = {
  pile: [],
  index: 0,
  processedOps: [],
  source: { label: 'Cards' },
  options: { ...DEFAULT_PILE_OPTIONS },
}

describe('useCardsMode start', () => {
  it('keeps a pile built locally when the server then echoes an empty one', async () => {
    const cards = useCardsMode()
    const started = cards.start(
      [item(1), item(2)],
      { label: 'Cards' },
      { ...DEFAULT_PILE_OPTIONS, excludeSeen: false, size: 10 },
      null,
    )

    await Promise.resolve()
    shared.resolveGet(shared.handle)
    await Promise.resolve()
    shared.handle.emit({ pile: emptyPile })

    await started

    expect(cards.pile.value.map(card => card.number)).toEqual([2, 1])
    expect(shared.handle.current.pile?.pile.map(card => card.number)).toEqual([2, 1])
  })
})
