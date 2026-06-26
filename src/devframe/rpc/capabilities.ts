import { defineRpcFunction } from 'devframe'
import { GHFS_VERSION } from '../../meta'
import { summarizeProject } from './helpers'
import { getProjectRegistry, tryGetHubContext } from './utils'

export const capabilities = defineRpcFunction({
  name: 'ghfs:capabilities',
  type: 'static',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    const hub = tryGetHubContext(context)
    return {
      handler: async () => ({
        mode: registry.mode,
        ghfsVersion: GHFS_VERSION,
        projects: await Promise.all(
          registry.listProjects().map(ctx => summarizeProject(ctx, { excluded: hub?.excluded.has(ctx.path) ?? false })),
        ),
      }),
    }
  },
})
