import type { HubSettings } from './types'
import { defineRpcFunction } from 'devframe'
import { setHubAutoSyncInterval } from '../../hub/config'
import { getHubContext } from './utils'

export const hubSetSettings = defineRpcFunction({
  name: 'ghfs:hub-set-settings',
  type: 'action',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (patch: { autoSyncIntervalMs?: number | null }): Promise<HubSettings> => {
        return hub.withLock(async () => {
          const value = patch.autoSyncIntervalMs ?? undefined
          const next = await setHubAutoSyncInterval({ homeDir: hub.homeDir, intervalMs: value })
          hub.autoSync.setInterval(next.autoSyncIntervalMs)
          return { autoSyncIntervalMs: next.autoSyncIntervalMs }
        })
      },
    }
  },
})
