import { computed, ref, toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { ActivityResult } from '#ghfs/rpc-types'
import { useRpc } from './useRpc'

const cache = new Map<string, Ref<ActivityResult | null>>()
const loading = new Set<string>()

const DEFAULT_ACTIVITY_DAYS = 60

export function useProjectActivity(projectId: MaybeRefOrGetter<string | null | undefined>, days = DEFAULT_ACTIVITY_DAYS) {
  const id = computed(() => {
    const value = toValue(projectId)
    return value ?? null
  })

  function bucketRef(key: string) {
    let r = cache.get(key)
    if (!r) {
      r = ref(null)
      cache.set(key, r)
    }
    return r
  }

  async function fetchFor(key: string) {
    if (loading.has(key))
      return
    loading.add(key)
    try {
      const result = await useRpc().$call('ghfs:project-activity', key, days)
      bucketRef(key).value = result
    }
    catch {
      // Leave previous value if any; silently ignore (hub home keeps rendering).
    }
    finally {
      loading.delete(key)
    }
  }

  const data = computed<ActivityResult | null>(() => {
    const key = id.value
    if (!key)
      return null
    const r = bucketRef(key)
    if (r.value == null && !loading.has(key))
      fetchFor(key)
    return r.value
  })

  function refresh() {
    const key = id.value
    if (key)
      fetchFor(key)
  }

  return { data, refresh }
}

/**
 * Invalidate the cached activity result for a project — call when the
 * project's sync state changes so the next read fetches fresh data.
 */
export function invalidateProjectActivity(projectId: string): void {
  const r = cache.get(projectId)
  if (r)
    r.value = null
}
