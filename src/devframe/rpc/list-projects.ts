import { defineRpcFunction } from 'devframe'
import { summarizeProject } from './helpers'
import { getProjectRegistry, tryGetHubContext } from './utils'

export const listProjects = defineRpcFunction({
  name: 'ghfs:list-projects',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    const hub = tryGetHubContext(context)
    return {
      handler: async () => Promise.all(
        registry.listProjects().map(ctx => summarizeProject(ctx, { excluded: hub?.excluded.has(ctx.path) ?? false })),
      ),
    }
  },
})
