import type { SuggestLabelsOptions } from './types'
import { defineRpcFunction } from 'devframe'
import { runLabelSuggestion } from '../../ai/labeling/run'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const suggestLabels = defineRpcFunction({
  name: 'ghfs:suggest-labels',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, options: SuggestLabelsOptions) => {
        const p = requireProject(registry, projectId)
        return runLabelSuggestion({
          config: p.config,
          storageDirAbsolute: p.storageDirAbsolute,
          executeFilePath: p.executeFilePath,
          ...options,
        })
      },
    }
  },
})
