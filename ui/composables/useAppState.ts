import type { InitialPayload, QueueState, RemoteStatus } from '#ghfs/server-types'
import type { SyncState } from '../../src/types/sync-state'

export interface ProgressState {
  kind: 'sync' | 'execute'
  stage?: string
  message?: string
  processed?: number
  total?: number
  percent?: number
}

export interface FilterState {
  state: 'all' | 'open' | 'closed'
  kind: 'issue' | 'pull'
  search: string
}

const payload = shallowRef<InitialPayload | null>(null)
const syncing = ref(false)
const executing = ref(false)
const progress = shallowRef<ProgressState | null>(null)
const queueOpen = ref(false)
const executeConfirmOpen = ref(false)
const selectedNumber = ref<number | null>(null)
const lastError = ref<string | null>(null)
const filters = reactive<FilterState>({
  state: 'open',
  kind: 'issue',
  search: '',
})

export function useAppState() {
  return {
    payload,
    syncing,
    executing,
    progress,
    queueOpen,
    executeConfirmOpen,
    selectedNumber,
    lastError,
    filters,
    setPayload(next: InitialPayload) {
      payload.value = next
    },
    patchSyncState(next: SyncState) {
      if (payload.value)
        payload.value = { ...payload.value, syncState: next }
    },
    patchQueue(next: QueueState) {
      if (payload.value)
        payload.value = { ...payload.value, queue: next }
    },
    patchRemote(next: RemoteStatus) {
      if (payload.value)
        payload.value = { ...payload.value, remote: next }
    },
    setSyncing(value: boolean) {
      syncing.value = value
    },
    setExecuting(value: boolean) {
      executing.value = value
    },
    setProgress(next: ProgressState | null) {
      progress.value = next
    },
    setError(next: string | null) {
      lastError.value = next
    },
    selectItem(number: number | null) {
      selectedNumber.value = number
    },
    openQueue() {
      queueOpen.value = true
    },
    closeQueue() {
      queueOpen.value = false
    },
    askExecute() {
      queueOpen.value = true
      executeConfirmOpen.value = true
    },
  }
}
