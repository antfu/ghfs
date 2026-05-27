import type { HubRecentItem } from './types'
import { defineRpcFunction } from 'devframe'
import { getEffectiveUpdatedAt } from '../../sync/effective-updated'
import { loadSyncState } from '../../sync/state'
import { getProjectRegistry } from './utils'

export const hubRecentItems = defineRpcFunction({
  name: 'ghfs:hub-recent-items',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (limit?: number) => {
        const cap = typeof limit === 'number' && limit > 0 ? Math.min(limit, 500) : 100
        const collected: HubRecentItem[] = []
        for (const p of registry.listProjects()) {
          const state = await loadSyncState(p.storageDirAbsolute)
          for (const item of Object.values(state.items)) {
            collected.push({
              projectId: p.id,
              repo: p.repo,
              kind: item.kind,
              number: item.number,
              title: item.data.item.title,
              state: item.state,
              stateReason: item.data.item.stateReason ?? null,
              ...(item.kind === 'pull' && item.data.pull
                ? {
                    pullIsDraft: item.data.pull.isDraft,
                    pullMerged: item.data.pull.merged,
                    ...(item.data.pull.reviewDecision ? { pullReviewDecision: item.data.pull.reviewDecision } : {}),
                  }
                : {}),
              updatedAt: getEffectiveUpdatedAt(item, p.config.bots),
              author: item.data.item.author,
              ...(item.data.item.authorAvatarUrl ? { authorAvatarUrl: item.data.item.authorAvatarUrl } : {}),
              labels: item.data.item.labels ?? [],
            })
          }
        }
        collected.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        return collected.slice(0, cap)
      },
    }
  },
})
