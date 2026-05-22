import type { SyncTriggerOptions } from '../../server/types'
import { defineRpcFunction } from 'devframe'
import { requireProject, triggerSync as triggerSyncImpl } from './helpers'
import { getProjectRegistry } from './utils'

export const triggerSync = defineRpcFunction({
  name: 'ghfs:trigger-sync',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, options: SyncTriggerOptions) => triggerSyncImpl(requireProject(registry, projectId), options ?? {}),
    }
  },
})
