import { computed, ref } from 'vue'
import { useAppState } from './useAppState'
import { useRpc } from './useRpc'
import { useUiState } from './useUiState'

const error = ref<string | null>(null)

// Inflight project ids — tracks every load currently in flight so concurrent
// requests for different projects (e.g. peek cards in cards mode) don't drop
// each other's responses. A repeat request for an id already in flight is
// deduped — the caller's promise resolves when the original load finishes.
const inflight = new Map<string, Promise<void>>()

async function load(id: string, options: { force?: boolean } = {}): Promise<void> {
  const bucket = useAppState(id)
  if (!options.force && bucket.payload.value)
    return
  const existing = inflight.get(id)
  if (existing)
    return existing
  const task = (async () => {
    try {
      const payload = await useRpc().$call('ghfs:initial-payload', id)
      bucket.setPayload(payload)
      useUiState().hydrate(id, payload.uiState)
      error.value = null
    }
    catch (err) {
      error.value = (err as Error).message
    }
    finally {
      inflight.delete(id)
    }
  })()
  inflight.set(id, task)
  return task
}

const loading = computed(() => inflight.size > 0)

export function useProjectPayload() {
  return {
    loading,
    error: computed(() => error.value),
    loadInitial(id: string) {
      return load(id, { force: true })
    },
    ensureLoaded(id: string) {
      return load(id, { force: false })
    },
  }
}
