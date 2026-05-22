import { defineRpcFunction } from 'devframe'
import { clearQueue as clearQueueImpl } from '../../server/queue-writer'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const clearQueue = defineRpcFunction({
  name: 'ghfs:clear-queue',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => {
        const p = requireProject(registry, projectId)
        return clearQueueImpl({
          storageDirAbsolute: p.storageDirAbsolute,
          executeFilePath: p.executeFilePath,
        })
      },
    }
  },
})
