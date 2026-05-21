import type { SyncItemState } from '../../src/types/sync-state'
import { refThrottled } from '@vueuse/core'

export function useFilteredItems() {
  const state = useAppState()

  const allEntries = computed<SyncItemState[]>(() => {
    const syncState = state.payload.value?.syncState
    if (!syncState)
      return []
    return Object.values(syncState.items)
      .sort((a, b) => b.data.item.updatedAt.localeCompare(a.data.item.updatedAt))
  })

  // Input updates `state.filters.search` instantly (so typing feels live),
  // but the heavy haystack scan only re-runs at ~6Hz to keep large lists
  // responsive. trailing=true ensures the last keystroke isn't dropped.
  const throttledSearch = refThrottled(computed(() => state.filters.search), 150, true)

  const filteredEntries = computed<SyncItemState[]>(() => {
    const search = throttledSearch.value.trim().toLowerCase()
    const searching = search.length > 0
    return allEntries.value.filter((entry) => {
      const item = entry.data.item
      if (item.state !== 'open')
        return false
      // When not searching, restrict by kind tab; when searching, show both.
      if (!searching && state.filters.kind !== item.kind)
        return false
      if (searching) {
        const body = item.body ?? ''
        const labels = (item.labels ?? []).join(' ')
        const assignees = (item.assignees ?? []).join(' ')
        const haystack = `${item.number} ${item.title} ${labels} ${assignees} ${item.author ?? ''} ${body}`.toLowerCase()
        if (!haystack.includes(search))
          return false
      }
      return true
    })
  })

  const counts = computed(() => {
    let issues = 0
    let pulls = 0
    for (const entry of allEntries.value) {
      if (entry.data.item.state !== 'open')
        continue
      if (entry.data.item.kind === 'issue')
        issues += 1
      else
        pulls += 1
    }
    return { issues, pulls }
  })

  return {
    allEntries,
    filteredEntries,
    counts,
  }
}
