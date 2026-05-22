import { defineRpcFunction } from 'devframe'
import { findProjectIcon } from '../../utils/project-icon'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const getProjectIcon = defineRpcFunction({
  name: 'ghfs:get-project-icon',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string) => findProjectIcon(requireProject(registry, projectId).path),
    }
  },
})
