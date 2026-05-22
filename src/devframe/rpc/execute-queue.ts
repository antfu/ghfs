import type { ExecuteTriggerOptions } from '../../server/types'
import { defineRpcFunction } from 'devframe'
import { executeQueue as executeQueueImpl, requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const executeQueue = defineRpcFunction({
  name: 'ghfs:execute-queue',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, options: ExecuteTriggerOptions) => executeQueueImpl(requireProject(registry, projectId), options ?? {}),
    }
  },
})
