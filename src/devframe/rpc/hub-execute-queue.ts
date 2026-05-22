import type { ExecutionResult } from '../../types/execution'
import { defineRpcFunction } from 'devframe'
import { executeQueue as executeQueueImpl, requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const hubExecuteQueue = defineRpcFunction({
  name: 'ghfs:hub-execute-queue',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (options: { projectId?: string } | undefined): Promise<ExecutionResult[]> => {
        const projects = options?.projectId
          ? [requireProject(registry, options.projectId)]
          : registry.listProjects()
        const results: ExecutionResult[] = []
        for (const p of projects) {
          try {
            const r = await executeQueueImpl(p, {})
            results.push(r)
          }
          catch {
            // Already broadcast via the per-project executor's onError; continue
            // running other projects so a single failure doesn't halt the batch.
          }
        }
        return results
      },
    }
  },
})
