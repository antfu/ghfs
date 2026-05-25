import { computed } from 'vue'
import { refThrottled } from '@vueuse/core'
import type { SyncItemState } from '../../src/types/sync-state'
import { getEffectiveUpdatedAt } from '../../src/sync/effective-updated'
import type { ListItem } from '../types/list-item'
import { fromSyncItem } from '../types/list-item'
import { useAppState } from './useAppState'
import { useUiState } from './useUiState'

export function useFilteredItems() {
  const state = useAppState()
  const ui = useUiState()

  const allItems = computed<ListItem[]>(() => {
    const payload = state.payload.value
    if (!payload)
      return []
    const projectId = payload.projectId
    const repo = payload.repo.repo
    const bots: string[] = payload.bots ?? []
    const items = Object.values(payload.syncState.items) as SyncItemState[]
    items.sort((a, b) =>
      getEffectiveUpdatedAt(b, bots).localeCompare(getEffectiveUpdatedAt(a, bots)),
    )
    return items.map(entry => fromSyncItem(entry, projectId, repo))
  })

  // Input updates `state.filters.search` instantly (so typing feels live),
  // but the heavy haystack scan only re-runs at ~6Hz to keep large lists
  // responsive. trailing=true ensures the last keystroke isn't dropped.
  const throttledSearch = refThrottled(computed(() => state.filters.search), 150, true)

  const filteredItems = computed<ListItem[]>(() => {
    const search = throttledSearch.value.trim().toLowerCase()
    const searching = search.length > 0
    return allItems.value.filter((item) => {
      if (item.state !== 'open')
        return false
      if (ui.isIgnored(item.number))
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
    for (const item of allItems.value) {
      if (item.state !== 'open')
        continue
      if (ui.isIgnored(item.number))
        continue
      if (item.kind === 'issue')
        issues += 1
      else
        pulls += 1
    }
    return { issues, pulls }
  })

  return {
    allItems,
    filteredItems,
    counts,
  }
}
