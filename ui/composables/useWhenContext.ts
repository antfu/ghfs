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
  online: boolean
  queueUpCount: number
  inputFocused: boolean
  paletteOpen: boolean
  helpOpen: boolean
  labelEditorOpen: boolean
  queueOpen: boolean
  executeConfirmOpen: boolean
  hubSettingsOpen: boolean
  hubQueueDrawerOpen: boolean
  hubExecuteAllConfirmOpen: boolean
  hubQueueTotal: number
  hubProjectsCount: number
  hasActiveProjectId: boolean
  anyOverlayOpen: boolean
  onCardsPage: boolean
  cardsHasPile: boolean
  cardsHasCurrent: boolean
  cardsAdvancing: boolean
  cardsCanClose: boolean
  cardsIsTodo: boolean
  cardsIsIgnored: boolean
  cardsCommentDialogOpen: boolean
  cardsDone: boolean
  cardsCanGoBack: boolean
  cardsHasPendingComment: boolean
}

export function useWhenContext(): ComputedRef<WhenContext> {
  const activeId = useActiveProjectId()
  const state = computed(() => useAppState(activeId.value ?? undefined))
  const ui = useUiState()
  const hub = useHubState()
  const hubUi = useHubUiState()
  const route = useRoute()
  const { filteredItems } = useFilteredItems()
  const recentFilteredAll = useRecentFiltered()
  const { filteredItems: recentFiltered, search: recentSearch } = recentFilteredAll
  const { upCount } = useQueue()
  const { totalCount: hubQueueTotal } = useHubQueue()
  const inputFocused = useInputFocus()
  const palette = useCommandPalette()
  const cards = useCardsMode()
  const { online } = useOnlineState()

  return computed<WhenContext>(() => {
    const num = state.value.selectedNumber.value
    let item = num == null
      ? null
      : state.value.payload.value?.syncState.items[String(num)]?.data.item ?? null
    // On the cards page the "active item" is the current card. Resolve it so
    // shortcuts that read the active item (g/J/K/etc.) keep working.
    if (!item) {
      const card = cards.currentCard.value
      if (card) {
        const cardState = useAppState(card.projectId)
        item = cardState.payload.value?.syncState.items[String(card.number)]?.data.item ?? null
      }
    }
    const hubMode = hub.capabilities.value?.mode === 'hub'
    const helpOpen = ui.helpOpen.value
    const labelEditorOpen = ui.labelEditorOpen.value
    const queueOpen = state.value.queueOpen.value
    const executeConfirmOpen = state.value.executeConfirmOpen.value
    const hubSettingsOpen = hubUi.settingsOpen.value
    const hubQueueDrawerOpen = hubUi.queueDrawerOpen.value
    const hubExecuteAllConfirmOpen = hubUi.executeAllConfirmOpen.value
    const onRecent = route.path === '/recent'
    const onCardsPage = route.path === '/cards'
    const cardsAdvancing = cards.advancing.value
    const cardsCommentDialogOpen = cards.commentDialogOpen.value
    return {
      route: route.path,
      hubMode,
      hubHome: hubMode && route.path === '/',
      hasActiveItem: !!item,
      activeItemKind: (item?.kind as WhenContext['activeItemKind']) ?? null,
      activeItemState: (item?.state as WhenContext['activeItemState']) ?? null,
      hasEntries: onRecent ? recentFiltered.value.length > 0 : filteredItems.value.length > 0,
      searching: onRecent
        ? recentSearch.value.trim().length > 0
        : state.value.filters.search.trim().length > 0,
      hasToken: state.value.payload.value?.repo.hasToken ?? false,
      hasSyncableProjects: hub.projects.value.some(p => p.hasToken),
      syncing: state.value.syncing.value,
      syncingAll: hubUi.syncingAll.value,
      executing: state.value.executing.value,
      online: online.value,
      queueUpCount: upCount.value,
      inputFocused: inputFocused.value,
      paletteOpen: palette.paletteOpen.value,
      helpOpen,
      labelEditorOpen,
      queueOpen,
      executeConfirmOpen,
      hubSettingsOpen,
      hubQueueDrawerOpen,
      hubExecuteAllConfirmOpen,
      hubQueueTotal: hubQueueTotal.value,
      hubProjectsCount: hub.projects.value.length,
      hasActiveProjectId: Boolean(activeId.value),
      // NB: cardsCommentDialogOpen is deliberately *not* in anyOverlayOpen.
      // The cards comment dialog is a Reka UiModal that handles its own
      // Escape via closeOnEscape, so propagating Escape to panel.close (which
      // would fall through to closing the queue etc.) just causes conflicts.
      anyOverlayOpen: helpOpen || labelEditorOpen || queueOpen
        || executeConfirmOpen
        || hubSettingsOpen || hubQueueDrawerOpen
        || hubExecuteAllConfirmOpen,
      onCardsPage,
      cardsHasPile: cards.total.value > 0,
      cardsHasCurrent: Boolean(cards.currentCard.value),
      cardsAdvancing,
      cardsCanClose: cards.currentCanClose.value,
      cardsIsTodo: cards.currentIsTodo.value,
      cardsIsIgnored: cards.currentIsIgnored.value,
      cardsCommentDialogOpen,
      cardsDone: cards.done.value,
      cardsCanGoBack: cards.canGoBack.value,
      cardsHasPendingComment: Boolean(cards.currentPendingComment.value),
    }
  })
}
