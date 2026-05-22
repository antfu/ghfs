import type { CardsPileState } from './types'
import { defineRpcFunction } from 'devframe'
import { clearCardsPile, getCardsPile, setCardsPile } from '../cards-state'

export const cardsPileGet = defineRpcFunction({
  name: 'ghfs:cards-pile-get',
  type: 'query',
  setup: () => ({
    handler: async () => getCardsPile(),
  }),
})

export const cardsPileSet = defineRpcFunction({
  name: 'ghfs:cards-pile-set',
  type: 'action',
  setup: () => ({
    handler: async (state: CardsPileState) => {
      setCardsPile(state)
    },
  }),
})

export const cardsPileClear = defineRpcFunction({
  name: 'ghfs:cards-pile-clear',
  type: 'action',
  setup: () => ({
    handler: async () => {
      clearCardsPile()
    },
  }),
})
