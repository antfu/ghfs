import type { HubSettings } from './types'
import { defineRpcFunction } from 'devframe'
import { loadHubConfig } from '../../hub/config'
import { getHubContext } from './utils'

export const hubSettings = defineRpcFunction({
  name: 'ghfs:hub-settings',
  type: 'query',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (): Promise<HubSettings> => {
        const current = await loadHubConfig({ homeDir: hub.homeDir })
        return { autoSyncIntervalMs: current.autoSyncIntervalMs }
      },
    }
  },
})
