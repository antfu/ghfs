import { toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useRoute, useRouter } from '#imports'
import { useAppState } from './useAppState'
import { useHubState } from './useHubState'

/**
 * Two-way sync between `state.selectedNumber` and the route's `number`
 * segment. Used by `PanelProject` so the URL reflects (and restores) the
 * currently-open issue/PR without history pollution.
 *
 * - In hub mode, the URL shape is `/{owner}/{repo}` <-> `/{owner}/{repo}/{number}`.
 * - In ui mode, the URL shape is `/` <-> `/{number}`.
 */
export function useSelectedItemSync(projectId: MaybeRefOrGetter<string>, initialNumber: MaybeRefOrGetter<number | null | undefined>): void {
  const route = useRoute()
  const router = useRouter()
  const hub = useHubState()

  function selectFor(id: string) {
    return useAppState(id).selectItem
  }

  function buildBase(id: string): string {
    const mode = hub.capabilities.value?.mode
    if (mode !== 'hub')
      return '/'
    const project = hub.projects.value.find(p => p.id === id)
    return project ? `/${project.repo}` : '/'
  }

  // Apply the URL number on mount/route change.
  watch(
    () => toValue(initialNumber),
    (number) => {
      const id = toValue(projectId)
      if (!id)
        return
      const select = selectFor(id)
      select(number ?? null)
    },
    { immediate: true },
  )

  // Reflect selection changes into the URL.
  watch(
    () => useAppState(toValue(projectId)).selectedNumber.value,
    (number) => {
      const id = toValue(projectId)
      if (!id)
        return
      const base = buildBase(id)
      const target = number == null ? base : `${base}/${number}`
      if (route.path === target)
        return
      router.replace(target).catch(() => {})
    },
  )
}
