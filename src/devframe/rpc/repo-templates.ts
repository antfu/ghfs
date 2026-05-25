import type { RepoTemplate, RepoTemplatesCache } from '../../server/repo-templates'
import { defineRpcFunction } from 'devframe'
import { loadRepoTemplates, saveRepoTemplates } from '../../server/repo-templates'
import { requireProject } from './helpers'
import { getProjectRegistry } from './utils'

export const repoTemplates = defineRpcFunction({
  name: 'ghfs:repo-templates',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string): Promise<RepoTemplatesCache> => {
        const ctx = requireProject(registry, projectId)
        return loadRepoTemplates(ctx.path, ctx.storageDirAbsolute)
      },
    }
  },
})

export const setRepoTemplates = defineRpcFunction({
  name: 'ghfs:set-repo-templates',
  type: 'action',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (projectId: string, templates: RepoTemplate[]): Promise<RepoTemplatesCache> => {
        const ctx = requireProject(registry, projectId)
        return saveRepoTemplates(ctx.path, ctx.storageDirAbsolute, templates)
      },
    }
  },
})
