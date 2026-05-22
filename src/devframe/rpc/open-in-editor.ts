import { defineRpcFunction } from 'devframe'
import { openInEditor as openInEditorImpl, requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const openInEditor = defineRpcFunction({
  name: 'ghfs:open-in-editor',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, filePath: string) => openInEditorImpl(requireProject(registry, projectId), filePath),
    }
  },
})
