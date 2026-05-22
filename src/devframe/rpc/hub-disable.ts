import { defineRpcFunction } from 'devframe'
import { closeProjectContext } from '../project-factory'
import { getHubContext } from './utils'

export const hubDisable = defineRpcFunction({
  name: 'ghfs:hub-disable',
  type: 'action',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (id: string): Promise<{ removed: boolean }> => {
        return hub.withLock(async () => {
          const ctx = hub.projects.get(id)
          if (!ctx)
            return { removed: false }
          hub.projects.delete(id)
          await closeProjectContext(ctx)
          await hub.persistEnabled()
          hub.broadcastProjectsChange()
          return { removed: true }
        })
      },
    }
  },
})
