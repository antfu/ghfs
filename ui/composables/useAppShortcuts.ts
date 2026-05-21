import type { Shortcut } from './useShortcuts'

export function createAppShortcuts(): Shortcut[] {
  const activeId = useActiveProjectId()
  // Resolve state lazily so shortcuts always operate on the *currently*
  // active project's bucket, not the one captured at install time.
  const state = computed(() => useAppState(activeId.value ?? undefined))
  const rpc = useProjectRpc(() => activeId.value ?? '__default__')
  const isDark = useDark()
  const ui = useUiState()
  const hub = useHubState()
  const hubUi = useHubUiState()
  const router = useRouter()
  const route = useRoute()
  const { filteredEntries } = useFilteredItems()
  const { upCount } = useQueue()
  const { activePanel, setPanel } = useActivePanel()

  const isHubMode = computed(() => hub.capabilities.value?.mode === 'hub')
  const isHubHome = computed(() => isHubMode.value && route.path === '/hub')
  const hasSyncableProjects = computed(() => hub.projects.value.some(p => p.hasToken))

  function focusFirstHubCard(): void {
    const first = document.querySelector<HTMLButtonElement>('[data-testid="hub-project-card"]')
    first?.focus()
  }

  const activeItem = computed(() => {
    const num = state.value.selectedNumber.value
    if (num == null) return null
    return state.value.payload.value?.syncState.items[String(num)]?.data.item ?? null
  })
  const searching = computed(() => state.value.filters.search.trim().length > 0)
  const hasToken = computed(() => state.value.payload.value?.repo.hasToken ?? false)
  const hasEntries = computed(() => filteredEntries.value.length > 0)

  const SCROLL_STEP = 120
  function navDown() {
    if (activePanel.value === 'detail') {
      scrollDetail(SCROLL_STEP)
      return
    }
    moveFocus(1)
  }
  function navUp() {
    if (activePanel.value === 'detail') {
      scrollDetail(-SCROLL_STEP)
      return
    }
    moveFocus(-1)
  }

  function moveFocus(delta: number) {
    const entries = filteredEntries.value
    if (!entries.length)
      return
    const current = state.value.selectedNumber.value == null
      ? -1
      : entries.findIndex(e => e.number === state.value.selectedNumber.value)
    const next = current < 0
      ? (delta > 0 ? 0 : entries.length - 1)
      : Math.max(0, Math.min(entries.length - 1, current + delta))
    state.value.selectItem(entries[next].number)
  }
  function focusFirst() {
    if (filteredEntries.value.length)
      state.value.selectItem(filteredEntries.value[0].number)
  }
  function focusLast() {
    if (filteredEntries.value.length)
      state.value.selectItem(filteredEntries.value[filteredEntries.value.length - 1].number)
  }

  function focusSearch() {
    const el = document.querySelector<HTMLInputElement>('[data-shortcut="search"]')
    if (!el) return
    el.focus()
    el.select()
  }

  function focusComment() {
    const el = document.querySelector<HTMLTextAreaElement>('[data-shortcut="comment-draft"]')
    if (!el) return
    el.focus()
  }

  async function triggerSync() {
    if (state.value.syncing.value) return
    state.value.setSyncing(true)
    state.value.setError(null)
    try {
      await rpc.triggerSync({})
    }
    catch (error) {
      state.value.setError(`Sync failed: ${(error as Error).message}`)
      state.value.setSyncing(false)
    }
  }
  function askExecute() {
    if (state.value.executing.value) return
    if (upCount.value === 0) return
    state.value.askExecute()
  }
  function toggleQueue() {
    if (state.value.queueOpen.value) state.value.closeQueue()
    else state.value.openQueue()
  }
  async function queueClose() {
    const num = activeItem.value?.number
    if (num == null) return
    const body = ui.getDraft(num).trim()
    try {
      if (body) {
        await rpc.addQueueOp({ action: 'close-with-comment', number: num, body })
        ui.clearDraft(num)
      }
      else {
        await rpc.addQueueOp({ action: 'close', number: num })
      }
    }
    catch (error) { state.value.setError((error as Error).message) }
  }
  async function queueReopen() {
    const num = activeItem.value?.number
    if (num == null) return
    try { await rpc.addQueueOp({ action: 'reopen', number: num }) }
    catch (error) { state.value.setError((error as Error).message) }
  }

  return [
    {
      id: 'nav.down',
      keys: ['j'],
      description: 'Next item / scroll down',
      enabled: () => activePanel.value === 'list' ? hasEntries.value : true,
      run: navDown,
    },
    {
      id: 'nav.up',
      keys: ['k'],
      description: 'Previous item / scroll up',
      enabled: () => activePanel.value === 'list' ? hasEntries.value : true,
      run: navUp,
    },
    {
      id: 'nav.down-arrow',
      keys: ['ArrowDown'],
      description: 'Next item / scroll down',
      enabled: () => activePanel.value === 'list' ? hasEntries.value : true,
      run: navDown,
    },
    {
      id: 'nav.up-arrow',
      keys: ['ArrowUp'],
      description: 'Previous item / scroll up',
      enabled: () => activePanel.value === 'list' ? hasEntries.value : true,
      run: navUp,
    },
    {
      id: 'nav.next-tab',
      keys: ['Tab'],
      label: ['Tab'],
      description: 'Next item',
      enabled: () => hasEntries.value,
      run: () => moveFocus(1),
    },
    {
      id: 'nav.prev-tab',
      keys: ['Shift+Tab'],
      label: ['⇧', 'Tab'],
      description: 'Previous item',
      enabled: () => hasEntries.value,
      run: () => moveFocus(-1),
    },
    {
      id: 'panel.focus-list',
      keys: ['ArrowLeft'],
      description: 'Focus list panel',
      run: () => setPanel('list'),
    },
    {
      id: 'panel.focus-detail',
      keys: ['ArrowRight'],
      description: 'Focus detail panel',
      run: () => setPanel('detail'),
    },
    {
      id: 'list.first',
      keys: ['g', 'g'],
      description: 'First item',
      enabled: () => activePanel.value === 'list' && hasEntries.value,
      run: focusFirst,
    },
    {
      id: 'list.last',
      keys: ['G'],
      description: 'Last item',
      enabled: () => activePanel.value === 'list' && hasEntries.value,
      run: focusLast,
    },
    {
      id: 'list.open',
      keys: ['g'],
      description: 'Open on GitHub',
      enabled: () => !!activeItem.value?.url,
      run: () => {
        const url = activeItem.value?.url
        if (url) window.open(url, '_blank', 'noreferrer')
      },
    },
    {
      id: 'tab.issues',
      keys: ['i'],
      description: 'Issues tab',
      enabled: () => !searching.value,
      run: () => { state.value.filters.kind = 'issue' },
    },
    {
      id: 'tab.pulls',
      keys: ['p'],
      description: 'Pull requests tab',
      enabled: () => !searching.value,
      run: () => { state.value.filters.kind = 'pull' },
    },
    {
      id: 'search.focus',
      keys: ['/'],
      description: 'Focus search',
      run: focusSearch,
    },
    {
      id: 'action.sync',
      keys: ['s'],
      description: 'Sync from GitHub',
      enabled: () => hasToken.value && !state.value.syncing.value,
      run: triggerSync,
    },
    {
      id: 'action.queue',
      keys: ['q'],
      description: 'Toggle queue',
      run: toggleQueue,
    },
    {
      id: 'action.execute',
      keys: ['x'],
      description: 'Execute queue',
      enabled: () => hasToken.value && upCount.value > 0 && !state.value.executing.value,
      run: askExecute,
    },
    {
      id: 'action.theme',
      keys: ['d'],
      description: 'Toggle theme',
      run: () => { isDark.value = !isDark.value },
    },
    {
      id: 'panel.close',
      keys: ['Escape'],
      description: 'Close overlay',
      enabled: () => ui.helpOpen.value
        || ui.labelEditorOpen.value
        || state.value.queueOpen.value
        || state.value.executeConfirmOpen.value
        || hubUi.pickerOpen.value
        || hubUi.settingsOpen.value
        || hubUi.queueDrawerOpen.value,
      run: () => {
        if (ui.helpOpen.value) {
          ui.helpOpen.value = false
          return
        }
        if (ui.labelEditorOpen.value) {
          ui.labelEditorOpen.value = false
          return
        }
        if (state.value.executeConfirmOpen.value) {
          state.value.executeConfirmOpen.value = false
          return
        }
        if (hubUi.settingsOpen.value) {
          hubUi.closeSettings()
          return
        }
        if (hubUi.pickerOpen.value) {
          hubUi.closePicker()
          return
        }
        if (hubUi.queueDrawerOpen.value) {
          hubUi.closeQueueDrawer()
          return
        }
        if (state.value.queueOpen.value) state.value.closeQueue()
      },
    },
    {
      id: 'item.close',
      keys: ['c'],
      description: 'Queue close',
      enabled: () => !!activeItem.value && activeItem.value.state === 'open',
      run: queueClose,
    },
    {
      id: 'item.reopen',
      keys: ['r'],
      description: 'Queue reopen',
      enabled: () => !!activeItem.value && activeItem.value.state === 'closed',
      run: queueReopen,
    },
    {
      id: 'item.labels',
      keys: ['l'],
      description: 'Edit labels',
      enabled: () => !!activeItem.value,
      run: () => { ui.labelEditorOpen.value = true },
    },
    {
      id: 'comment.focus',
      keys: ['n'],
      description: 'Focus comment',
      enabled: () => !!activeItem.value,
      run: focusComment,
    },
    {
      id: 'pr.tab.conversation',
      keys: ['v'],
      description: 'Conversation tab',
      enabled: () => activeItem.value?.kind === 'pull',
      run: () => ui.setLastPrTab('conversation'),
    },
    {
      id: 'pr.tab.commits',
      keys: ['m'],
      description: 'Commits tab',
      enabled: () => activeItem.value?.kind === 'pull',
      run: () => ui.setLastPrTab('commits'),
    },
    {
      id: 'pr.tab.changes',
      keys: ['f'],
      description: 'Changes tab',
      enabled: () => activeItem.value?.kind === 'pull',
      run: () => ui.setLastPrTab('changes'),
    },
    {
      id: 'help.open',
      keys: ['?'],
      description: 'Keyboard shortcuts',
      run: () => { ui.helpOpen.value = true },
    },
    {
      id: 'settings.open',
      keys: [','],
      description: 'Settings',
      enabled: () => !hubUi.settingsOpen.value,
      run: () => hubUi.openSettings(),
    },
    {
      id: 'hub.recent',
      keys: ['u'],
      description: 'Recent activity (hub)',
      enabled: () => isHubMode.value && route.path !== '/hub/recent',
      run: () => { router.push('/hub/recent') },
    },
    {
      id: 'hub.queue-page',
      keys: ['Q'],
      description: 'Open hub queue page',
      enabled: () => isHubMode.value && route.path !== '/hub/queue',
      run: () => { router.push('/hub/queue') },
    },
    {
      id: 'hub.prev-project',
      keys: ['['],
      description: 'Previous project (hub)',
      enabled: () => isHubMode.value && hub.projects.value.length > 1 && Boolean(activeId.value),
      run: () => navigateProject(-1),
    },
    {
      id: 'hub.next-project',
      keys: [']'],
      description: 'Next project (hub)',
      enabled: () => isHubMode.value && hub.projects.value.length > 1 && Boolean(activeId.value),
      run: () => navigateProject(1),
    },
    {
      id: 'hub.back',
      keys: ['b'],
      description: 'Back to hub home',
      enabled: () => isHubMode.value && Boolean(activeId.value),
      run: () => { router.push('/hub') },
    },
    {
      id: 'hub.sync-all',
      keys: ['s'],
      description: 'Sync all projects',
      enabled: () => isHubHome.value && hasSyncableProjects.value && !hubUi.syncingAll.value,
      run: () => { syncAllProjects() },
    },
    {
      id: 'hub.manage',
      keys: ['m'],
      description: 'Manage hub projects',
      enabled: () => isHubHome.value && !hubUi.pickerOpen.value,
      run: () => hubUi.openPicker(),
    },
    {
      id: 'hub.focus-first',
      keys: ['j'],
      description: 'Focus first project',
      enabled: () => isHubHome.value && hub.projects.value.length > 0,
      run: focusFirstHubCard,
    },
  ]

  function navigateProject(delta: number): void {
    const projects = hub.projects.value
    if (projects.length === 0)
      return
    const currentIdx = projects.findIndex(p => p.id === activeId.value)
    const nextIdx = currentIdx < 0
      ? 0
      : (currentIdx + delta + projects.length) % projects.length
    const next = projects[nextIdx]
    if (next)
      router.push(`/hub/${next.id}`)
  }
}
