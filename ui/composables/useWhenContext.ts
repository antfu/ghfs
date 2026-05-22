export interface WhenContext extends Record<string, unknown> {
  route: string
  hubMode: boolean
  hubHome: boolean
  hasActiveItem: boolean
  activeItemKind: 'issue' | 'pull' | null
  activeItemState: 'open' | 'closed' | 'merged' | null
  hasEntries: boolean
  searching: boolean
  hasToken: boolean
  hasSyncableProjects: boolean
  syncing: boolean
  syncingAll: boolean
  executing: boolean
  queueUpCount: number
  inputFocused: boolean
  paletteOpen: boolean
  helpOpen: boolean
  labelEditorOpen: boolean
  queueOpen: boolean
  executeConfirmOpen: boolean
  hubPickerOpen: boolean
  hubSettingsOpen: boolean
  hubQueueDrawerOpen: boolean
  hubProjectsCount: number
  hasActiveProjectId: boolean
  anyOverlayOpen: boolean
}

export function useWhenContext(): ComputedRef<WhenContext> {
  const activeId = useActiveProjectId()
  const state = computed(() => useAppState(activeId.value ?? undefined))
  const ui = useUiState()
  const hub = useHubState()
  const hubUi = useHubUiState()
  const route = useRoute()
  const { filteredItems } = useFilteredItems()
  const { filteredItems: recentFiltered } = useRecentFiltered()
  const { upCount } = useQueue()
  const inputFocused = useInputFocus()
  const palette = useCommandPalette()

  return computed<WhenContext>(() => {
    const num = state.value.selectedNumber.value
    const item = num == null
      ? null
      : state.value.payload.value?.syncState.items[String(num)]?.data.item ?? null
    const hubMode = hub.capabilities.value?.mode === 'hub'
    const helpOpen = ui.helpOpen.value
    const labelEditorOpen = ui.labelEditorOpen.value
    const queueOpen = state.value.queueOpen.value
    const executeConfirmOpen = state.value.executeConfirmOpen.value
    const hubPickerOpen = hubUi.pickerOpen.value
    const hubSettingsOpen = hubUi.settingsOpen.value
    const hubQueueDrawerOpen = hubUi.queueDrawerOpen.value
    const onRecent = route.path === '/recent'
    return {
      route: route.path,
      hubMode,
      hubHome: hubMode && route.path === '/',
      hasActiveItem: !!item,
      activeItemKind: (item?.kind as WhenContext['activeItemKind']) ?? null,
      activeItemState: (item?.state as WhenContext['activeItemState']) ?? null,
      hasEntries: onRecent ? recentFiltered.value.length > 0 : filteredItems.value.length > 0,
      searching: state.value.filters.search.trim().length > 0,
      hasToken: state.value.payload.value?.repo.hasToken ?? false,
      hasSyncableProjects: hub.projects.value.some(p => p.hasToken),
      syncing: state.value.syncing.value,
      syncingAll: hubUi.syncingAll.value,
      executing: state.value.executing.value,
      queueUpCount: upCount.value,
      inputFocused: inputFocused.value,
      paletteOpen: palette.paletteOpen.value,
      helpOpen,
      labelEditorOpen,
      queueOpen,
      executeConfirmOpen,
      hubPickerOpen,
      hubSettingsOpen,
      hubQueueDrawerOpen,
      hubProjectsCount: hub.projects.value.length,
      hasActiveProjectId: Boolean(activeId.value),
      anyOverlayOpen: helpOpen || labelEditorOpen || queueOpen
        || executeConfirmOpen || hubPickerOpen
        || hubSettingsOpen || hubQueueDrawerOpen,
    }
  })
}
