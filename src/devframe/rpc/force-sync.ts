import { defineRpcFunction } from 'devframe'
import { forceSync as forceSyncImpl, requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const forceSync = defineRpcFunction({
  name: 'ghfs:force-sync',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => forceSyncImpl(requireProject(registry, projectId)),
    }
  },
})
