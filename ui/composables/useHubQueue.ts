import type { HubQueueGroup } from './useRpc'

const groups = ref<HubQueueGroup[]>([])
const loaded = ref(false)
const executing = ref<string | 'all' | null>(null)

let installed = false

function totalFor(g: HubQueueGroup): number {
  return g.queue.entries.filter(e => e.source !== 'per-item').length
}

export function useHubQueue() {
  if (!installed && typeof window !== 'undefined') {
    installed = true
    void load()
  }

  async function load() {
    try {
      const fresh = await useRpc().hubQueue()
      groups.value = fresh
      loaded.value = true
    }
    catch {
      // keep last known state; the navbar badge just won't update.
    }
  }

  async function executeProject(projectId: string) {
    executing.value = projectId
    try {
      await useRpc().hubExecuteQueue({ projectId })
    }
    finally {
      executing.value = null
      await load()
    }
  }

  async function executeAll() {
    executing.value = 'all'
    try {
      await useRpc().hubExecuteQueue({})
    }
    finally {
      executing.value = null
      await load()
    }
  }

  const groupedEntries = computed(() => groups.value
    .map(g => ({ ...g, total: totalFor(g) }))
    .filter(g => g.total > 0),
  )

  const totalCount = computed(() => groupedEntries.value.reduce((sum, g) => sum + g.total, 0))

  return {
    groups: groupedEntries,
    totalCount,
    executing,
    loaded,
    load,
    executeProject,
    executeAll,
  }
}
