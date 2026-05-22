import type { UiState } from '../../server/types'
import { defineRpcFunction } from 'devframe'
import { saveUiState as saveUiStateImpl } from '../../server/ui-state'
import { requireProject } from './helpers'
import { getProjectRegistry, getUiStateSavedCallback } from './utils'

export const saveUiState = defineRpcFunction({
  name: 'ghfs:save-ui-state',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, state: UiState) => {
        const p = requireProject(registry, projectId)
        await saveUiStateImpl(p.storageDirAbsolute, state)
        getUiStateSavedCallback(context)?.(state, projectId)
      },
    }
  },
})
