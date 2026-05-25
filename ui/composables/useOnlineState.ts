import type { ComputedRef, Ref } from 'vue'
import { useOnline } from '@vueuse/core'

let cached: { online: Ref<boolean>, offline: ComputedRef<boolean> } | null = null

export function useOnlineState() {
  if (cached)
    return cached
  const online = useOnline()
  const offline = computed(() => !online.value)
  cached = { online, offline }
  return cached
}
