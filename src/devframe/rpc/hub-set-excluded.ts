import { defineRpcFunction } from 'devframe'
import { getHubContext } from './utils'

/**
 * Hide (or restore) an enabled project from the hub. Excluded projects stay
 * loaded and keep syncing — the exclusion only filters them out of the hub
 * home, aggregates, and recent/todo/queue views. Persisted to hub.json and
 * broadcast so every open client refreshes its project list.
 */
export const hubSetExcluded = defineRpcFunction({
  name: 'ghfs:hub-set-excluded',
  type: 'action',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (id: string, excluded: boolean): Promise<{ excluded: boolean }> => {
        return hub.withLock(async () => {
          const ctx = hub.projects.get(id)
          if (!ctx)
            return { excluded: false }
          const had = hub.excluded.has(ctx.path)
          if (excluded)
            hub.excluded.add(ctx.path)
          else
            hub.excluded.delete(ctx.path)
          if (had !== excluded) {
            await hub.persistExcluded()
            hub.broadcastProjectsChange()
          }
          return { excluded }
        })
      },
    }
  },
})
