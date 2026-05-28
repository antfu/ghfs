import { computed } from 'vue'
import type { QueueEntry } from '#ghfs/server-types'
import { useAppState } from './useAppState'

export function useQueue() {
  const state = useAppState()

  const entries = computed<QueueEntry[]>(() => state.payload.value?.queue.entries ?? [])

  const upCount = computed<number>(() => entries.value.length)

  return { entries, upCount }
}
