import type { HubTodoItem } from './types'
import { defineRpcFunction } from 'devframe'
import { loadUiState } from '../../server/ui-state'
import { getEffectiveUpdatedAt } from '../../sync/effective-updated'
import { loadSyncState } from '../../sync/state'
import { getProjectRegistry } from './utils'

export const hubTodos = defineRpcFunction({
  name: 'ghfs:hub-todos',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (): Promise<HubTodoItem[]> => {
        const collected: HubTodoItem[] = []
        for (const p of registry.listProjects()) {
          const ui = await loadUiState(p.storageDirAbsolute)
          const todos = ui.todos ?? []
          if (todos.length === 0)
            continue
          const sync = await loadSyncState(p.storageDirAbsolute)
          for (const n of todos) {
            const entry = sync.items[String(n)]
            if (!entry)
              continue
            const item = entry.data.item
            collected.push({
              projectId: p.id,
              repo: p.repo,
              kind: item.kind,
              number: item.number,
              title: item.title,
              state: item.state,
              updatedAt: getEffectiveUpdatedAt(entry, p.config.bots),
              author: item.author,
              ...(item.authorAvatarUrl ? { authorAvatarUrl: item.authorAvatarUrl } : {}),
              labels: item.labels ?? [],
            })
          }
        }
        collected.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        return collected
      },
    }
  },
})
