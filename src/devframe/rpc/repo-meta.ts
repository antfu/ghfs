import { defineRpcFunction } from 'devframe'
import { buildRepoMeta, requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const repoMeta = defineRpcFunction({
  name: 'ghfs:repo-meta',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => buildRepoMeta(requireProject(registry, projectId)),
    }
  },
})
