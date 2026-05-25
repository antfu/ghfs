import type { HubSettings, HubSettingsPatch } from './types'
import { defineRpcFunction } from 'devframe'
import { loadHubConfig, setHubAutoSyncInterval, setHubSwrSettings } from '../../hub/config'
import { getHubContext } from './utils'

export const hubSetSettings = defineRpcFunction({
  name: 'ghfs:hub-set-settings',
  type: 'action',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (patch: HubSettingsPatch): Promise<HubSettings> => {
        return hub.withLock(async () => {
          let current = await loadHubConfig({ homeDir: hub.homeDir })

          if (patch.autoSyncIntervalMs !== undefined) {
            const value = patch.autoSyncIntervalMs ?? undefined
            current = await setHubAutoSyncInterval({ homeDir: hub.homeDir, intervalMs: value })
            hub.autoSync.setInterval(current.autoSyncIntervalMs)
          }

          if (patch.swrSyncEnabled !== undefined || patch.swrCacheTimeoutMs !== undefined) {
            const swrEnabled = patch.swrSyncEnabled === undefined
              ? current.swrSyncEnabled
              : patch.swrSyncEnabled ?? undefined
            const swrTimeout = patch.swrCacheTimeoutMs === undefined
              ? current.swrCacheTimeoutMs
              : patch.swrCacheTimeoutMs ?? undefined
            current = await setHubSwrSettings({
              homeDir: hub.homeDir,
              swrSyncEnabled: swrEnabled,
              swrCacheTimeoutMs: swrTimeout,
            })
          }

          return {
            autoSyncIntervalMs: current.autoSyncIntervalMs,
            swrSyncEnabled: current.swrSyncEnabled,
            swrCacheTimeoutMs: current.swrCacheTimeoutMs,
          }
        })
      },
    }
  },
})
