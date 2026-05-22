import { defineRpcFunction } from 'devframe'
import open from 'open'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const openFolder = defineRpcFunction({
  name: 'ghfs:open-folder',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => {
        const ctx = requireProject(registry, projectId)
        await open(ctx.path)
      },
    }
  },
})
