import { computed, ref, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import { useRpc } from './useRpc'

type IconState = { pending: true } | { pending: false, dataUrl: string | null }

const cache = new Map<string, IconState>()
const refs = new Map<string, Ref<IconState>>()

function getOrCreate(projectId: string): Ref<IconState> {
  let r = refs.get(projectId)
  if (r)
    return r
  const cached = cache.get(projectId)
  r = ref<IconState>(cached ?? { pending: true })
  refs.set(projectId, r)
  if (!cached)
    void load(projectId)
  return r
}

async function load(projectId: string): Promise<void> {
  let state: IconState
  try {
    const rpc = useRpc()
    const dataUrl = await rpc.$call('ghfs:get-project-icon', projectId)
    state = { pending: false, dataUrl }
  }
  catch {
    state = { pending: false, dataUrl: null }
  }
  cache.set(projectId, state)
  const r = refs.get(projectId)
  if (r)
    r.value = state
}

/**
 * Reactively resolve a project's icon by id. Returns `pending` until the RPC
 * settles, then a `dataUrl` (null = no local icon found, fall back upstream).
 * Subsequent callers for the same id share the cached result.
 */
export function useProjectIcon(projectId: MaybeRefOrGetter<string>): ComputedRef<IconState> {
  return computed(() => {
    const id = toValue(projectId)
    if (!id)
      return { pending: false, dataUrl: null }
    return getOrCreate(id).value
  })
}

/** Invalidate cached icons (e.g. when the hub root changes). */
export function clearProjectIconCache(): void {
  cache.clear()
  for (const r of refs.values())
    r.value = { pending: true }
}
