import type { QueueState } from '../../server/types'
import { defineRpcFunction } from 'devframe'
import { buildQueueState } from '../../server/queue-builder'
import { getProjectRegistry } from './utils'

export const hubQueue = defineRpcFunction({
  name: 'ghfs:hub-queue',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async () => {
        const out: { projectId: string, repo: string, queue: QueueState }[] = []
        for (const p of registry.listProjects()) {
          const queue = await buildQueueState({
            storageDirAbsolute: p.storageDirAbsolute,
            executeFilePath: p.executeFilePath,
          })
          out.push({ projectId: p.id, repo: p.repo, queue })
        }
        return out
      },
    }
  },
})
