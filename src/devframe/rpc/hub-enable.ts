import { defineRpcFunction } from 'devframe'
import { resolve } from 'pathe'
import { getHubContext } from './utils'

export const hubEnable = defineRpcFunction({
  name: 'ghfs:hub-enable',
  type: 'action',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (path: string): Promise<{ id: string }> => {
        return hub.withLock(async () => {
          const absolutePath = resolve(path)
          const existing = Array.from(hub.projects.values()).find(p => p.path === absolutePath)
          if (existing)
            return { id: existing.id }
          const ctx = await hub.loadProjectByPath(absolutePath)
          hub.projects.set(ctx.id, ctx)
          await hub.persistEnabled()
          hub.broadcastProjectsChange()
          return { id: ctx.id }
        })
      },
    }
  },
})
