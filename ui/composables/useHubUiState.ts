const pickerOpen = ref(false)
const settingsOpen = ref(false)
const queueDrawerOpen = ref(false)
const executeAllConfirmOpen = ref(false)
const syncingAll = ref(false)

export function useHubUiState() {
  return {
    pickerOpen,
    settingsOpen,
    queueDrawerOpen,
    executeAllConfirmOpen,
    syncingAll,
    openPicker() {
      pickerOpen.value = true
    },
    closePicker() {
      pickerOpen.value = false
    },
    openSettings() {
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
  const targets = hub.projects.value.filter(p => p.hasToken)
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
