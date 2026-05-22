import { defineRpcFunction } from 'devframe'
import { summarizeProject } from './helpers'
import { getProjectRegistry } from './utils'

export const listProjects = defineRpcFunction({
  name: 'ghfs:list-projects',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async () => Promise.all(registry.listProjects().map(summarizeProject)),
    }
  },
})
