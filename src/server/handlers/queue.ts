import type { PendingOp } from '../../execute/types'
import type { ServerContext } from '../context'
import type { QueueState } from '../types'
import {
  addQueueOp as addQueueOpImpl,
  clearQueue as clearQueueImpl,
  removeQueueOp as removeQueueOpImpl,
  updateQueueOp as updateQueueOpImpl,
} from '../queue-writer'

export function createQueueHandlers(ctx: ServerContext): {
  addQueueOp: (op: PendingOp) => Promise<QueueState>
  updateQueueOp: (id: string, op: PendingOp) => Promise<QueueState>
  removeQueueOp: (id: string) => Promise<QueueState>
  clearQueue: () => Promise<QueueState>
} {
  const options = {
    storageDirAbsolute: ctx.storageDirAbsolute,
    executeFilePath: ctx.executeFilePath,
  }
  return {
    addQueueOp: op => addQueueOpImpl(options, op),
    updateQueueOp: (id, op) => updateQueueOpImpl(options, id, op),
    removeQueueOp: id => removeQueueOpImpl(options, id),
    clearQueue: () => clearQueueImpl(options),
  }
}
