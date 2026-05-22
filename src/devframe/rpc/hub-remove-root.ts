import type { ProjectContext } from '../project-context'
import type { HubInfo } from './types'
import { defineRpcFunction } from 'devframe'
import { removeHubRoot } from '../../hub/config'
import { diagnostics } from '../../logger'
import { closeProjectContext } from '../project-factory'
import { isUnder, resolveHubRoot } from './hub-helpers'
import { getHubContext } from './utils'

export const hubRemoveRoot = defineRpcFunction({
  name: 'ghfs:hub-remove-root',
  type: 'action',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (rawPath: string): Promise<HubInfo> => {
        return hub.withLock(async () => {
          const target = resolveHubRoot(rawPath)
          if (!hub.roots.has(target))
            throw diagnostics.GHFS0206({ detail: `Hub root not registered: ${target}` })
          const toRemove: ProjectContext[] = []
          for (const ctx of hub.projects.values()) {
            if (isUnder(ctx.path, target))
              toRemove.push(ctx)
          }
          for (const ctx of toRemove) {
            hub.projects.delete(ctx.id)
            await closeProjectContext(ctx)
          }
          await removeHubRoot({ homeDir: hub.homeDir, path: target })
          hub.roots.delete(target)
          hub.broadcastHubInfoChange()
          if (toRemove.length > 0)
            hub.broadcastProjectsChange()
          return hub.buildHubInfo()
        })
      },
    }
  },
})
