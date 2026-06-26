import { computed, ref } from 'vue'
import type { HubRecentItem } from '#ghfs/rpc-types'
import { useActiveProjectId, useAppState } from './useAppState'
import { useHubState } from './useHubState'
import { useProjectPayload } from './useProjectPayload'
import { useRpc } from './useRpc'

const items = ref<HubRecentItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const selectedKey = ref<string | null>(null)

export function recentItemKey(item: Pick<HubRecentItem, 'projectId' | 'kind' | 'number'>): string {
  return `${item.projectId}-${item.kind}-${item.number}`
}

export function useHubRecent() {
  const payload = useProjectPayload()
  const hub = useHubState()
  // Hide items belonging to projects the user has excluded from the hub.
  const visibleItems = computed<HubRecentItem[]>(() => {
    const hidden = hub.excludedIds.value
    if (hidden.size === 0)
      return items.value
    return items.value.filter(it => !hidden.has(it.projectId))
  })

  async function load(limit = 100) {
    loading.value = true
    error.value = null
    try {
      const fresh = await useRpc().$call('ghfs:hub-recent-items', limit)
      items.value = fresh ?? []
    }
    catch (err) {
      error.value = (err as Error).message
    }
    finally {
      loading.value = false
    }
  }

  async function selectItem(item: Pick<HubRecentItem, 'projectId' | 'kind' | 'number'>) {
    selectedKey.value = recentItemKey(item)
    useActiveProjectId().value = item.projectId
    await payload.ensureLoaded(item.projectId)
    useAppState(item.projectId).selectItem(item.number)
  }

  return {
    items: visibleItems,
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    selectedKey,
    selectKey(key: string | null) {
      selectedKey.value = key
    },
    selectItem,
    load,
  }
}
