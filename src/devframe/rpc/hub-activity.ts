import { defineRpcFunction } from 'devframe'
import { computeProjectActivityBuckets } from '../../sync/activity'
import { loadSyncState } from '../../sync/state'
import { getProjectRegistry } from './utils'

export const hubActivity = defineRpcFunction({
  name: 'ghfs:hub-activity',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (days?: number) => {
        const d = days ?? 90
        const buckets = Array.from<number>({ length: d }).fill(0)
        let total = 0
        for (const p of registry.listProjects()) {
          const state = await loadSyncState(p.storageDirAbsolute)
          const r = computeProjectActivityBuckets(state, d)
          for (let i = 0; i < d; i++)
            buckets[i] += r.buckets[i]
          total += r.total
        }
        return { buckets, total, days: d }
      },
    }
  },
})
