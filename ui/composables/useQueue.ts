import { computed } from 'vue'
import type { QueueEntry } from '#ghfs/server-types'
import { useAppState } from './useAppState'

export function useQueue() {
  const state = useAppState()

  const entries = computed<QueueEntry[]>(() => {
    const all = state.payload.value?.queue.entries ?? []
    return all.filter(e => e.source !== 'per-item')
  })

  const upCount = computed<number>(() => entries.value.length)

  return { entries, upCount }
}
