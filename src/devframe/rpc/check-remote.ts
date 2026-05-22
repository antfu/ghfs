import { defineRpcFunction } from 'devframe'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const checkRemote = defineRpcFunction({
  name: 'ghfs:check-remote',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => requireProject(registry, projectId).poller.checkNow(),
    }
  },
})
