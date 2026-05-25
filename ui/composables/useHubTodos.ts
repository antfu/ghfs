import { computed, ref } from 'vue'
import type { HubTodoItem } from '#ghfs/rpc-types'
import type { IssueKind } from '../../src/types/issue'
import type { ListItem } from '../types/list-item'
import { listItemKey } from '../types/list-item'
import { useRpc } from './useRpc'

const items = ref<HubTodoItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const kind = ref<IssueKind>('issue')

function toListItem(it: HubTodoItem): ListItem {
  return {
    key: listItemKey({ projectId: it.projectId, kind: it.kind, number: it.number }),
    projectId: it.projectId,
    repo: it.repo,
    kind: it.kind,
    number: it.number,
    title: it.title,
    author: it.author,
    authorAvatarUrl: it.authorAvatarUrl,
    updatedAt: it.updatedAt,
    labels: it.labels,
    state: it.state,
  }
}

export function useHubTodos() {
  async function load() {
    loading.value = true
    error.value = null
    try {
      const fresh = await useRpc().$call('ghfs:hub-todos')
      items.value = fresh ?? []
    }
    catch (err) {
      error.value = (err as Error).message
    }
    finally {
      loading.value = false
    }
  }

  const listItems = computed<ListItem[]>(() => items.value.map(toListItem))
  const filteredListItems = computed<ListItem[]>(() => listItems.value.filter(it => it.kind === kind.value))

  const counts = computed(() => {
    let issues = 0
    let pulls = 0
    for (const it of listItems.value) {
      if (it.kind === 'issue')
        issues += 1
      else
        pulls += 1
    }
    return { issues, pulls }
  })

  return {
    items: computed(() => items.value),
    listItems,
    filteredListItems,
    counts,
    kind,
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    load,
  }
}
