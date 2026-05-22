import { defineRpcFunction } from 'devframe'
import { getHubContext } from './utils'

export const hubInfo = defineRpcFunction({
  name: 'ghfs:hub-info',
  type: 'query',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async () => hub.buildHubInfo(),
    }
  },
})
