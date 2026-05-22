const loading = ref(false)
const error = ref<string | null>(null)
// Tracks the project id whose payload we're currently loading; late responses
// for a stale request are dropped to avoid clobbering newer state.
let inflightId: string | null = null

async function load(id: string, options: { force?: boolean } = {}): Promise<void> {
  const bucket = useAppState(id)
  if (!options.force && bucket.payload.value)
    return
  loading.value = true
  error.value = null
  inflightId = id
  try {
    const payload = await useRpc().$call('ghfs:initial-payload', id)
    if (inflightId !== id)
      return
    bucket.setPayload(payload)
    useUiState().hydrate(id, payload.uiState)
  }
  catch (err) {
    if (inflightId !== id)
      return
    error.value = (err as Error).message
  }
  finally {
    if (inflightId === id) {
      loading.value = false
      inflightId = null
    }
  }
}

export function useProjectPayload() {
  return {
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    loadInitial(id: string) {
      return load(id, { force: true })
    },
    ensureLoaded(id: string) {
      return load(id, { force: false })
    },
  }
}
