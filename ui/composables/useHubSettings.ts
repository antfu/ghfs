import type { HubSettings } from '#ghfs/rpc-types'

const settings = ref<HubSettings | null>(null)
const hydrated = ref(false)

/** Hub-wide settings (only meaningful in hub mode). */
export function useHubSettings() {
  async function load() {
    try {
      const fetched = await useRpc().$call('ghfs:hub-settings')
      settings.value = fetched
      hydrated.value = true
    }
    catch {
      settings.value = {}
      hydrated.value = true
    }
  }

  async function setAutoSyncIntervalMs(value: number | undefined) {
    const next = await useRpc().$call('ghfs:hub-set-settings', {
      autoSyncIntervalMs: value === undefined ? null : value,
    })
    settings.value = next
  }

  async function setSwrSyncEnabled(value: boolean | undefined) {
    const next = await useRpc().$call('ghfs:hub-set-settings', {
      swrSyncEnabled: value === undefined ? null : value,
    })
    settings.value = next
  }

  async function setSwrCacheTimeoutMs(value: number | undefined) {
    const next = await useRpc().$call('ghfs:hub-set-settings', {
      swrCacheTimeoutMs: value === undefined ? null : value,
    })
    settings.value = next
  }

  return {
    settings: computed(() => settings.value),
    hydrated: computed(() => hydrated.value),
    load,
    setAutoSyncIntervalMs,
    setSwrSyncEnabled,
    setSwrCacheTimeoutMs,
  }
}
