import { defineRpcFunction } from 'devframe'
import { removeQueueOp as removeQueueOpImpl } from '../../server/queue-writer'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const removeQueueOp = defineRpcFunction({
  name: 'ghfs:remove-queue-op',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, id: string) => {
        const p = requireProject(registry, projectId)
        return removeQueueOpImpl({
          storageDirAbsolute: p.storageDirAbsolute,
          executeFilePath: p.executeFilePath,
        }, id)
      },
    }
  },
})
