import { defineRpcFunction } from 'devframe'
import { buildQueueState } from '../../server/queue-builder'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const queueState = defineRpcFunction({
  name: 'ghfs:queue-state',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => {
        const p = requireProject(registry, projectId)
        return buildQueueState({
          storageDirAbsolute: p.storageDirAbsolute,
          executeFilePath: p.executeFilePath,
        })
      },
    }
  },
})
