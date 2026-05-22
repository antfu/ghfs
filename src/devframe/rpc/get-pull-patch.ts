import { defineRpcFunction } from 'devframe'
import { getPullPatch as getPullPatchImpl, requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const getPullPatch = defineRpcFunction({
  name: 'ghfs:get-pull-patch',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, number: number) => getPullPatchImpl(requireProject(registry, projectId), number),
    }
  },
})
