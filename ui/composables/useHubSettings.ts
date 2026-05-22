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
    const patch: Partial<HubSettings> & { autoSyncIntervalMs?: number } = { autoSyncIntervalMs: value }
    const next = await useRpc().$call('ghfs:hub-set-settings', patch)
    settings.value = next
  }

  return {
    settings: computed(() => settings.value),
    hydrated: computed(() => hydrated.value),
    load,
    setAutoSyncIntervalMs,
  }
}
