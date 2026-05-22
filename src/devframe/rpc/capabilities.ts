import { defineRpcFunction } from 'devframe'
import { GHFS_VERSION } from '../../meta'
import { summarizeProject } from './helpers'
import { getProjectRegistry } from './utils'

export const capabilities = defineRpcFunction({
  name: 'ghfs:capabilities',
  type: 'static',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async () => ({
        mode: registry.mode,
        ghfsVersion: GHFS_VERSION,
        projects: await Promise.all(registry.listProjects().map(summarizeProject)),
      }),
    }
  },
})
