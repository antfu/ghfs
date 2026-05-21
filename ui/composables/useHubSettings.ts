import type { HubSettings } from './useRpc'

const settings = ref<HubSettings | null>(null)
const hydrated = ref(false)

/** Hub-wide settings (only meaningful in hub mode). */
export function useHubSettings() {
  async function load() {
    try {
      const fetched = await useRpc().hubSettings()
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
    const next = await useRpc().hubSetSettings(patch)
    settings.value = next
  }

  return {
    settings: computed(() => settings.value),
    hydrated: computed(() => hydrated.value),
    load,
    setAutoSyncIntervalMs,
  }
}
