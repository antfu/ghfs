import { defineRpcFunction } from 'devframe'
import { loadSyncState } from '../../sync/state'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const syncState = defineRpcFunction({
  name: 'ghfs:sync-state',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => loadSyncState(requireProject(registry, projectId).storageDirAbsolute),
    }
  },
})
