import type { PendingOp } from '../../execute/types'
import { defineRpcFunction } from 'devframe'
import { updateQueueOp as updateQueueOpImpl } from '../../server/queue-writer'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const updateQueueOp = defineRpcFunction({
  name: 'ghfs:update-queue-op',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, id: string, op: PendingOp) => {
        const p = requireProject(registry, projectId)
        return updateQueueOpImpl({
          storageDirAbsolute: p.storageDirAbsolute,
          executeFilePath: p.executeFilePath,
        }, id, op)
      },
    }
  },
})
