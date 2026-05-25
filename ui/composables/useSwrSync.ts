import type { Ref } from 'vue'

const DEFAULT_TTL = 300_000

const lastRefreshedAt = new Map<string, number>()
const inflight = reactive(new Set<string>())

function keyFor(projectId: string, number: number): string {
  return `${projectId}#${number}`
}

/**
 * Stale-While-Revalidate refresh for an issue/PR detail view.
 *
 * - Cache hit (last refresh within TTL): no-op, so rapid back-and-forth
 *   navigation doesn't hammer the GitHub API.
 * - Cache miss: kicks off a silent `ghfs:trigger-sync` with `{ numbers: [n] }`.
 *   Fresh data lands in the UI via the existing `onSyncStateChange`
 *   broadcast → `useAppState().patchSyncState()` pipeline; no manual merge.
 *
 * The TTL and on/off toggle are read live from the active settings store
 * (hub-wide when in hub mode, per-project `.ui.json` otherwise).
 */
export function useSwrSync() {
  const uiState = useUiState()
  const hubSettings = useHubSettings()
  const hubState = useHubState()
  const rpc = useRpc()

  function isEnabled(): boolean {
    if (hubState.capabilities.value?.mode === 'hub')
      return hubSettings.settings.value?.swrSyncEnabled !== false
    return uiState.uiState.swrSyncEnabled !== false
  }

  function getTtl(): number {
    const ms = hubState.capabilities.value?.mode === 'hub'
      ? hubSettings.settings.value?.swrCacheTimeoutMs
      : uiState.uiState.swrCacheTimeoutMs
    return typeof ms === 'number' && ms > 0 ? ms : DEFAULT_TTL
  }

  async function checkAndRefresh(projectId: string | null, number: number | null): Promise<void> {
    if (!projectId || number == null)
      return
    if (!isEnabled())
      return

    const key = keyFor(projectId, number)
    if (Date.now() - (lastRefreshedAt.get(key) ?? 0) < getTtl())
      return

    const state = useAppState(projectId)
    // A full or auto-sync is already running — would throw GHFS0200.
    if (state.syncing.value)
      return
    if (inflight.has(key))
      return

    // Pre-mark so a rapid second navigation to the same item doesn't queue
    // a duplicate request while this one is in flight.
    lastRefreshedAt.set(key, Date.now())
    inflight.add(key)

    try {
      await rpc.$call('ghfs:trigger-sync', projectId, { numbers: [number], silent: true })
      lastRefreshedAt.set(key, Date.now())
    }
    catch {
      // Silent failure (no token, network blip, concurrency lock).
      // Clear the timestamp so the next visit retries.
      lastRefreshedAt.delete(key)
    }
    finally {
      inflight.delete(key)
    }
  }

  function isRefreshing(
    projectId: Ref<string | null> | string | null,
    number: Ref<number | null> | number | null,
  ) {
    return computed(() => {
      const p = unref(projectId)
      const n = unref(number)
      if (!p || n == null)
        return false
      return inflight.has(keyFor(p, n))
    })
  }

  return {
    checkAndRefresh,
    isRefreshing,
  }
}
