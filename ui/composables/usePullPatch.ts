type PatchState = 'idle' | 'loading' | 'loaded' | 'missing' | 'error'

interface PatchEntry {
  state: PatchState
  text?: string
  error?: string
}

const cache = reactive<Map<number, PatchEntry>>(new Map())

export function usePullPatch(numberRef: Ref<number | null> | ComputedRef<number | null>) {
  const rpc = useRpc()

  const entry = computed<PatchEntry>(() => {
    const num = numberRef.value
    if (num == null)
      return { state: 'idle' }
    return cache.get(num) ?? { state: 'idle' }
  })

  async function load(force = false) {
    const num = numberRef.value
    if (num == null)
      return
    const existing = cache.get(num)
    if (!force && existing && existing.state !== 'idle' && existing.state !== 'error')
      return
    cache.set(num, { state: 'loading' })
    try {
      const text = await rpc.getPullPatch(num)
      if (text == null)
        cache.set(num, { state: 'missing' })
      else
        cache.set(num, { state: 'loaded', text })
    }
    catch (err) {
      cache.set(num, { state: 'error', error: (err as Error).message })
    }
  }

  watch(numberRef, (num) => {
    if (num == null)
      return
    const existing = cache.get(num)
    if (!existing || existing.state === 'idle')
      load()
  }, { immediate: true })

  return { entry, load }
}
