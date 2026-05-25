import type { ProjectInitialPayload } from '#ghfs/rpc-types'
import type { QueueState, RemoteStatus } from '#ghfs/server-types'
import type { SyncProgressSnapshot, SyncStage, SyncSummary } from '#ghfs/sync-contracts'
import type { SyncState } from '#ghfs/sync-state'

export interface ProgressCurrentItem {
  kind: 'issue' | 'pull'
  number: number
  action: string
}

export interface ProgressState {
  kind: 'sync' | 'execute'
  phase: 'running' | 'success' | 'error'
  stage?: SyncStage
  message?: string
  processed?: number
  total?: number
  percent?: number
  /** Epoch ms when the run started — used to render a live elapsed timer. */
  startedAt?: number
  /** Full counter snapshot from the sync engine (sync runs only). */
  snapshot?: SyncProgressSnapshot
  /** Item currently being fetched (parsed from fetch-stage messages). */
  currentItem?: ProgressCurrentItem
  /** Stages that have already ended; drives the pipeline-dot "done" state. */
  stageHistory?: SyncStage[]
  /** Final summary, populated after a sync completes successfully. */
  summary?: SyncSummary
  /** Stage where an error occurred, if known. */
  errorStage?: SyncStage
}

export interface FilterState {
  kind: 'issue' | 'pull'
  search: string
}

export interface ProjectAppState {
  payload: Ref<ProjectInitialPayload | null>
  syncing: Ref<boolean>
  executing: Ref<boolean>
  progress: Ref<ProgressState | null>
  queueOpen: Ref<boolean>
  executeConfirmOpen: Ref<boolean>
  selectedNumber: Ref<number | null>
  lastError: Ref<string | null>
  filters: FilterState
}

interface AppStateBucket extends ProjectAppState {}

const buckets = new Map<string, AppStateBucket>()

// Active project id used by composables when no explicit id is passed.
// Components in routes set this from the route param.
const _activeProjectId = ref<string | null>(null)

export function useActiveProjectId(): Ref<string | null> {
  return _activeProjectId
}

export function setActiveProjectId(id: string | null): void {
  _activeProjectId.value = id
}

function makeBucket(): AppStateBucket {
  return {
    payload: shallowRef<ProjectInitialPayload | null>(null),
    syncing: ref(false),
    executing: ref(false),
    progress: shallowRef<ProgressState | null>(null),
    queueOpen: ref(false),
    executeConfirmOpen: ref(false),
    selectedNumber: ref<number | null>(null),
    lastError: ref<string | null>(null),
    filters: reactive<FilterState>({ kind: 'issue', search: '' }),
  }
}

function bucketFor(projectId: string): AppStateBucket {
  let bucket = buckets.get(projectId)
  if (!bucket) {
    bucket = makeBucket()
    buckets.set(projectId, bucket)
  }
  return bucket
}

export function useAppState(projectId?: string | null) {
  const id = projectId ?? _activeProjectId.value ?? '__default__'
  const bucket = bucketFor(id)
  return {
    payload: bucket.payload,
    syncing: bucket.syncing,
    executing: bucket.executing,
    progress: bucket.progress,
    queueOpen: bucket.queueOpen,
    executeConfirmOpen: bucket.executeConfirmOpen,
    selectedNumber: bucket.selectedNumber,
    lastError: bucket.lastError,
    filters: bucket.filters,
    setPayload(next: ProjectInitialPayload) {
      bucket.payload.value = next
    },
    patchSyncState(next: SyncState) {
      if (bucket.payload.value)
        bucket.payload.value = { ...bucket.payload.value, syncState: next }
    },
    patchQueue(next: QueueState) {
      if (bucket.payload.value)
        bucket.payload.value = { ...bucket.payload.value, queue: next }
    },
    patchRemote(next: RemoteStatus) {
      if (bucket.payload.value)
        bucket.payload.value = { ...bucket.payload.value, remote: next }
    },
    setSyncing(value: boolean) {
      bucket.syncing.value = value
    },
    setExecuting(value: boolean) {
      bucket.executing.value = value
    },
    setProgress(next: ProgressState | null) {
      bucket.progress.value = next
    },
    setError(next: string | null) {
      bucket.lastError.value = next
    },
    selectItem(number: number | null) {
      bucket.selectedNumber.value = number
    },
    openQueue() {
      bucket.queueOpen.value = true
    },
    closeQueue() {
      bucket.queueOpen.value = false
    },
    askExecute() {
      bucket.queueOpen.value = true
      bucket.executeConfirmOpen.value = true
    },
  }
}

export function clearAppState(projectId: string): void {
  buckets.delete(projectId)
}
