import { defineRpcFunction } from 'devframe'
import { runDuplicateDetection } from '../../ai/duplicates/run'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const findDuplicates = defineRpcFunction({
  name: 'ghfs:find-duplicates',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => {
        const p = requireProject(registry, projectId)
        return runDuplicateDetection({ config: p.config, storageDirAbsolute: p.storageDirAbsolute })
      },
    }
  },
})
