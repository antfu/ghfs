import type { PendingOp } from '../../execute/types'
import { defineRpcFunction } from 'devframe'
import { addQueueOp as addQueueOpImpl } from '../../server/queue-writer'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const addQueueOp = defineRpcFunction({
  name: 'ghfs:add-queue-op',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, op: PendingOp) => {
        const p = requireProject(registry, projectId)
        return addQueueOpImpl({
          storageDirAbsolute: p.storageDirAbsolute,
          executeFilePath: p.executeFilePath,
        }, op)
      },
    }
  },
})
