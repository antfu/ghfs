import type { ServerContext } from './context'
import type { ServerFunctions } from './types'
import { createEditorHandler } from './handlers/editor'
import { createExecuteHandler } from './handlers/execute'
import { createQueueHandlers } from './handlers/queue'
import { createRemoteHandler } from './handlers/remote'
import { createStateHandlers } from './handlers/state'
import { createSyncHandler } from './handlers/sync'

export function createServerFunctions(ctx: ServerContext): ServerFunctions {
  const state = createStateHandlers(ctx)
  const queue = createQueueHandlers(ctx)
  return {
    getInitialPayload: state.getInitialPayload,
    getSyncState: state.getSyncState,
    getQueue: state.getQueue,
    getRepoMeta: state.getRepoMeta,
    triggerSync: createSyncHandler(ctx),
    executeQueue: createExecuteHandler(ctx),
    addQueueOp: queue.addQueueOp,
    updateQueueOp: queue.updateQueueOp,
    removeQueueOp: queue.removeQueueOp,
    clearQueue: queue.clearQueue,
    checkRemote: createRemoteHandler(ctx),
    openInEditor: createEditorHandler(ctx),
    saveUiState: state.saveUiState,
  }
}
