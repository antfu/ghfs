import type { ListItem } from '../types/list-item'
import { refThrottled } from '@vueuse/core'
import { fromHubRecent } from '../types/list-item'

const search = ref('')

export function useRecentFiltered() {
  const recent = useHubRecent()
  const hub = useHubState()

  const repoLookup = computed(() => {
    const m = new Map<string, string>()
    for (const p of hub.projects.value)
      m.set(p.id, p.repo)
    return m
  })

  const allItems = computed<ListItem[]>(() => {
    const lookup = repoLookup.value
    return recent.items.value.map(it => fromHubRecent(it, id => lookup.get(id)))
  })

  const throttledSearch = refThrottled(search, 150, true)

  const filteredItems = computed<ListItem[]>(() => {
    const q = throttledSearch.value.trim().toLowerCase()
    if (!q)
      return allItems.value
    return allItems.value.filter((item) => {
      const labels = (item.labels ?? []).join(' ')
      const haystack = `${item.number} ${item.title} ${item.repo} ${labels} ${item.author ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  })

  return {
    items: allItems,
    filteredItems,
    search,
  }
}
