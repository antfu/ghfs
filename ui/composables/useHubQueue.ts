import type { HubQueueGroup } from '#ghfs/rpc-types'

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
      const fresh = await useRpc().$call('ghfs:hub-queue')
      groups.value = fresh
      loaded.value = true
    }
    catch {
      // keep last known state; the navbar badge just won't update.
    }
  }

  async function executeProject(projectId: string) {
    if (useOnlineState().offline.value)
      return
    executing.value = projectId
    try {
      await useRpc().$call('ghfs:hub-execute-queue', { projectId })
    }
    finally {
      executing.value = null
      await load()
    }
  }

  async function executeAll() {
    if (useOnlineState().offline.value)
      return
    executing.value = 'all'
    try {
      await useRpc().$call('ghfs:hub-execute-queue', {})
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
