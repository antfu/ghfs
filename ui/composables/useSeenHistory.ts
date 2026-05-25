import { computed, ref } from 'vue'
import type { SeenEntry } from '#ghfs/server-types'
import { useHubState } from './useHubState'
import { useRpc } from './useRpc'
import { useUiState } from './useUiState'

/**
 * Cross-project seen-history lookup.
 *
 * - In project (ui) mode the active project's `ui.json` is the sole source
 *   of truth and `useUiState` already carries everything we need.
 * - In hub mode rows can come from any enabled project, so we lazily fetch
 *   `ghfs:hub-seen-history` (which merges every project's `ui.json#seenHistory`)
 *   and cache the result. Writes update both the active project's state via
 *   `useUiState().markSeen` (which handles persistence) and this in-process
 *   cache so cross-project rows reflect new marks immediately.
 */

const hubSeen = ref<Record<string, SeenEntry>>({})
let hubLoaded = false
let hubLoadPromise: Promise<void> | null = null

function ensureHubLoaded(): Promise<void> {
  if (hubLoaded)
    return Promise.resolve()
  if (hubLoadPromise)
    return hubLoadPromise
  const rpc = useRpc()
  hubLoadPromise = rpc.$call('ghfs:hub-seen-history')
    .then((merged) => {
      hubSeen.value = merged ?? {}
      hubLoaded = true
    })
    .catch(() => {
      // Network / RPC failure: behave as an empty hub map (row gray-out
      // will be best-effort from local ui state only).
      hubLoaded = true
    })
  return hubLoadPromise
}

export function useSeenHistory() {
  const ui = useUiState()
  const hub = useHubState()
  const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')

  if (isHubMode.value && !hubLoaded && !hubLoadPromise)
    ensureHubLoaded()

  function getSeenEntry(key: string): SeenEntry | undefined {
    return ui.getSeenEntry(key) ?? (isHubMode.value ? hubSeen.value[key] : undefined)
  }

  function markSeen(key: string, entry: SeenEntry): void {
    ui.markSeen(key, entry)
    // Mirror into the hub cache so other-project rows can dim without
    // waiting for the next refresh. Harmless in project mode (the cache
    // is just unused).
    hubSeen.value = { ...hubSeen.value, [key]: entry }
  }

  return { getSeenEntry, markSeen }
}
