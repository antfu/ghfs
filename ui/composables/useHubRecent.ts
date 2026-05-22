import type { HubRecentItem } from './useRpc'

const items = ref<HubRecentItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

export function useHubRecent() {
  async function load(limit = 100) {
    loading.value = true
    error.value = null
    try {
      const fresh = await useRpc().hubRecentItems(limit)
      items.value = fresh ?? []
    }
    catch (err) {
      error.value = (err as Error).message
    }
    finally {
      loading.value = false
    }
  }

  return {
    items: computed(() => items.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    load,
  }
}
