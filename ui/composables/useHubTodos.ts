import type { HubTodoItem } from '#ghfs/rpc-types'
import type { ListItem } from '../types/list-item'
import { listItemKey } from '../types/list-item'

const items = ref<HubTodoItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

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

  return {
    items: computed(() => items.value),
    listItems,
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    load,
  }
}
