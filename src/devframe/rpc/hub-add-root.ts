import type { HubInfo } from './types'
import { defineRpcFunction } from 'devframe'
import { addHubRoot } from '../../hub/config'
import { assertDirectory, resolveHubRoot } from './hub-helpers'
import { getHubContext } from './utils'

export const hubAddRoot = defineRpcFunction({
  name: 'ghfs:hub-add-root',
  type: 'action',
  setup: (context) => {
    const hub = getHubContext(context)
    return {
      handler: async (rawPath: string): Promise<HubInfo> => {
        return hub.withLock(async () => {
          const next = resolveHubRoot(rawPath)
          await assertDirectory(next)
          if (hub.roots.has(next))
            return hub.buildHubInfo()
          await addHubRoot({ homeDir: hub.homeDir, path: next })
          hub.roots.add(next)
          hub.broadcastHubInfoChange()
          return hub.buildHubInfo()
        })
      },
    }
  },
})
