import { ref } from 'vue'
import { useAppState } from './useAppState'
import { useHubState } from './useHubState'
import { useOnlineState } from './useOnlineState'
import { useRpc } from './useRpc'

export type SettingsTab = 'general' | 'account' | 'projects' | 'templates' | 'ignored'

const settingsOpen = ref(false)
const settingsTab = ref<SettingsTab>('general')
const queueDrawerOpen = ref(false)
const executeAllConfirmOpen = ref(false)
const syncingAll = ref(false)

export function useHubUiState() {
  return {
    settingsOpen,
    settingsTab,
    queueDrawerOpen,
    executeAllConfirmOpen,
    syncingAll,
    openSettings(tab?: SettingsTab) {
      if (tab)
        settingsTab.value = tab
      settingsOpen.value = true
    },
    closeSettings() {
      settingsOpen.value = false
    },
    openQueueDrawer() {
      queueDrawerOpen.value = true
    },
    closeQueueDrawer() {
      queueDrawerOpen.value = false
    },
    openExecuteAllConfirm() {
      executeAllConfirmOpen.value = true
    },
    closeExecuteAllConfirm() {
      executeAllConfirmOpen.value = false
    },
    setSyncingAll(value: boolean) {
      syncingAll.value = value
    },
  }
}

/**
 * Trigger a sync across every enabled project that has a token. Idempotent:
 * subsequent calls while a sync-all is in flight are no-ops.
 */
export async function syncAllProjects(): Promise<void> {
  const hub = useHubState()
  const rpc = useRpc()
  const ui = useHubUiState()
  const { offline } = useOnlineState()
  if (ui.syncingAll.value)
    return
  if (offline.value)
    return
  const targets = hub.visibleProjects.value.filter(p => p.hasToken)
  if (targets.length === 0)
    return
  ui.setSyncingAll(true)
  try {
    await Promise.allSettled(targets.map(p => rpc.$call('ghfs:trigger-sync', p.id, {})))
    try {
      const fresh = await rpc.$call('ghfs:list-projects')
      hub.setProjects(fresh)
    }
    catch { /* ignore */ }
  }
  finally {
    ui.setSyncingAll(false)
  }
}

/**
 * Trigger a sync for a single project from the hub (e.g. the project card's
 * context menu). Sets the project's syncing flag eagerly so the card shows a
 * spinner immediately; live progress events take over from there, and
 * `onSyncComplete` clears the flag + refreshes the project list.
 */
export async function syncProject(projectId: string): Promise<void> {
  const rpc = useRpc()
  const { offline } = useOnlineState()
  const state = useAppState(projectId)
  if (offline.value)
    return
  if (state.syncing.value)
    return
  state.setSyncing(true)
  state.setError(null)
  try {
    await rpc.$call('ghfs:trigger-sync', projectId, {})
  }
  catch (error) {
    state.setError(`Sync failed: ${(error as Error).message}`)
    state.setSyncing(false)
  }
}

/**
 * Hide or restore a project on the hub. The server persists the change and
 * broadcasts `onProjectsChange`, so every client refetches the project list
 * (which carries the updated `excluded` flag) and the card appears/disappears.
 */
export async function setProjectExcluded(projectId: string, excluded: boolean): Promise<void> {
  await useRpc().$call('ghfs:hub-set-excluded', projectId, excluded)
}
