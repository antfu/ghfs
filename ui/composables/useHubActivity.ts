import type { ActivityResult } from '#ghfs/rpc-types'

const cache = ref<ActivityResult | null>(null)
let loading = false

export function useHubActivity(days = 90) {
  async function fetchNow() {
    if (loading)
      return
    loading = true
    try {
      cache.value = await useRpc().$call('ghfs:hub-activity', days)
    }
    catch {
      // Leave previous value if any — the summary keeps rendering with stale data.
    }
    finally {
      loading = false
    }
  }

  const data = computed<ActivityResult | null>(() => {
    if (cache.value == null && !loading)
      fetchNow()
    return cache.value
  })

  function refresh() {
    fetchNow()
  }

  return { data, refresh }
}

/**
 * Invalidate the cached aggregate activity — call when any project's sync
 * state changes so the next read fetches fresh data.
 */
export function invalidateHubActivity(): void {
  cache.value = null
}
