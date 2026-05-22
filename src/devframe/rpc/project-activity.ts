import { defineRpcFunction } from 'devframe'
import { computeProjectActivityBuckets } from '../../sync/activity'
import { loadSyncState } from '../../sync/state'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const projectActivity = defineRpcFunction({
  name: 'ghfs:project-activity',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, days?: number) => {
        const p = requireProject(registry, projectId)
        const state = await loadSyncState(p.storageDirAbsolute)
        return computeProjectActivityBuckets(state, days ?? 30)
      },
    }
  },
})
