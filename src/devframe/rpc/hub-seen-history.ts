import type { SeenEntry } from '../../server/ui-state'
import { defineRpcFunction } from 'devframe'
import { loadUiState } from '../../server/ui-state'
import { getProjectRegistry } from './utils'

/**
 * Aggregate `seenHistory` from every enabled project's `ui.json` into one
 * map. Keys are already `${projectId}#${number}` so the union is
 * collision-free. Hub-mode UI calls this once on mount to populate a
 * cross-project lookup; per-project writes update the cache in-process.
 */
export const hubSeenHistory = defineRpcFunction({
  name: 'ghfs:hub-seen-history',
  type: 'query',
  setup: (context) => {
    const registry = getProjectRegistry(context)
    return {
      handler: async (): Promise<Record<string, SeenEntry>> => {
        const merged: Record<string, SeenEntry> = {}
        for (const project of registry.listProjects()) {
          const ui = await loadUiState(project.storageDirAbsolute)
          const seen = ui.seenHistory
          if (!seen)
            continue
          for (const [key, entry] of Object.entries(seen))
            merged[key] = entry
        }
        return merged
      },
    }
  },
})
