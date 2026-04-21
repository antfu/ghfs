import type { ProviderItem } from '../../src/types/provider'

export function useFilteredItems() {
  const state = useAppState()

  const allItems = computed<ProviderItem[]>(() => {
    const syncState = state.payload.value?.syncState
    if (!syncState)
      return []
    return Object.values(syncState.items)
      .map(entry => entry.data.item)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })

  const filteredItems = computed<ProviderItem[]>(() => {
    const search = state.filters.search.trim().toLowerCase()
    return allItems.value.filter((item) => {
      if (state.filters.state !== 'all' && item.state !== state.filters.state)
        return false
      if (state.filters.kind !== 'all' && item.kind !== state.filters.kind)
        return false
      if (search) {
        const haystack = `${item.number} ${item.title} ${item.labels.join(' ')} ${item.assignees.join(' ')} ${item.author ?? ''}`.toLowerCase()
        if (!haystack.includes(search))
          return false
      }
      return true
    })
  })

  return {
    allItems,
    filteredItems,
  }
}
