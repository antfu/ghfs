import type { ExecuteTriggerOptions, QueueState, RemoteStatus, SyncTriggerOptions, UiState } from '#ghfs/server-types'
import type { PendingOp } from '#ghfs/execute-types'
import type { ExecutionResult } from '#ghfs/execution-types'
import type { SyncSummary } from '#ghfs/sync-contracts'

export type ProjectIdResolver = string | (() => string)

function toId(resolver: ProjectIdResolver): string {
  return typeof resolver === 'function' ? resolver() : resolver
}

/**
 * Project-scoped RPC wrapper. Components that operate on a single
 * project (Navbar, DetailPanel, QueuePanel, LabelEditor, etc.) call
 * this and get a familiar method-bag without having to thread
 * `projectId` through every call site.
 */
export function useProjectRpc(projectId: ProjectIdResolver) {
  const rpc = useRpc()
  return {
    triggerSync: (options?: SyncTriggerOptions): Promise<SyncSummary> => rpc.triggerSync(toId(projectId), options ?? {}),
    executeQueue: (options?: ExecuteTriggerOptions): Promise<ExecutionResult> => rpc.executeQueue(toId(projectId), options ?? {}),
    addQueueOp: (op: PendingOp): Promise<QueueState> => rpc.addQueueOp(toId(projectId), op),
    updateQueueOp: (id: string, op: PendingOp): Promise<QueueState> => rpc.updateQueueOp(toId(projectId), id, op),
    removeQueueOp: (id: string): Promise<QueueState> => rpc.removeQueueOp(toId(projectId), id),
    clearQueue: (): Promise<QueueState> => rpc.clearQueue(toId(projectId)),
    checkRemote: (): Promise<RemoteStatus> => rpc.checkRemote(toId(projectId)),
    openInEditor: (filePath: string): Promise<void> => rpc.openInEditor(toId(projectId), filePath),
    saveUiState: (state: UiState): Promise<void> => rpc.saveUiState(toId(projectId), state),
    getPullPatch: (number: number): Promise<string | null> => rpc.getPullPatch(toId(projectId), number),
  }
}
