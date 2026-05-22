import type { ReactionTarget } from '../../types/provider'
import type { ReactionContent } from '../../utils/reactions'
import { defineRpcFunction } from 'devframe'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const getViewerReactions = defineRpcFunction({
  name: 'ghfs:get-viewer-reactions',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, number: number, target: ReactionTarget): Promise<ReactionContent[]> => {
        const project = requireProject(registry, projectId)
        const provider = await project.getProvider()
        if (!provider)
          return []
        return provider.fetchViewerReactions(number, target)
      },
    }
  },
})
