import type { IssueKind } from '../../src/types/issue'
import type { ListItem } from '../types/list-item'
import { refThrottled } from '@vueuse/core'
import { fromHubRecent } from '../types/list-item'

const search = ref('')
const kind = ref<IssueKind>('issue')

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
    const searching = q.length > 0
    return allItems.value.filter((item) => {
      // While searching, show both kinds so a free-text search isn't hidden
      // by the kind tab (mirrors useFilteredItems for project view).
      if (!searching && item.kind !== kind.value)
        return false
      if (searching) {
        const labels = (item.labels ?? []).join(' ')
        const haystack = `${item.number} ${item.title} ${item.repo} ${labels} ${item.author ?? ''}`.toLowerCase()
        if (!haystack.includes(q))
          return false
      }
      return true
    })
  })

  const counts = computed(() => {
    let issues = 0
    let pulls = 0
    for (const item of allItems.value) {
      if (item.kind === 'issue')
        issues += 1
      else
        pulls += 1
    }
    return { issues, pulls }
  })

  return {
    items: allItems,
    filteredItems,
    search,
    kind,
    counts,
  }
}
