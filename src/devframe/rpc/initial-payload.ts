import { defineRpcFunction } from 'devframe'
import { buildInitialPayload, requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const initialPayload = defineRpcFunction({
  name: 'ghfs:initial-payload',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => buildInitialPayload(requireProject(registry, projectId)),
    }
  },
})
