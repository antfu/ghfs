import type { Shortcut } from './useShortcuts'

export function createAppShortcuts(): Shortcut[] {
  const state = useAppState()
  const rpc = useRpc()
  const isDark = useDark()
  const ui = useUiState()
  const { filteredEntries } = useFilteredItems()
  const { upCount } = useQueue()
  const { activePanel, setPanel } = useActivePanel()

  const activeItem = computed(() => {
    const num = state.selectedNumber.value
    if (num == null) return null
    return state.payload.value?.syncState.items[String(num)]?.data.item ?? null
  })
  const searching = computed(() => state.filters.search.trim().length > 0)
  const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)
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
    const current = state.selectedNumber.value == null
      ? -1
      : entries.findIndex(e => e.number === state.selectedNumber.value)
    const next = current < 0
      ? (delta > 0 ? 0 : entries.length - 1)
      : Math.max(0, Math.min(entries.length - 1, current + delta))
    state.selectItem(entries[next].number)
  }
  function focusFirst() {
    if (filteredEntries.value.length)
      state.selectItem(filteredEntries.value[0].number)
  }
  function focusLast() {
    if (filteredEntries.value.length)
      state.selectItem(filteredEntries.value[filteredEntries.value.length - 1].number)
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
    if (state.syncing.value) return
    state.setSyncing(true)
    state.setError(null)
    try {
      await rpc.triggerSync({})
    }
    catch (error) {
      state.setError(`Sync failed: ${(error as Error).message}`)
      state.setSyncing(false)
    }
  }
  function askExecute() {
    if (state.executing.value) return
    if (upCount.value === 0) return
    state.askExecute()
  }
  function toggleQueue() {
    if (state.queueOpen.value) state.closeQueue()
    else state.openQueue()
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
    catch (error) { state.setError((error as Error).message) }
  }
  async function queueReopen() {
    const num = activeItem.value?.number
    if (num == null) return
    try { await rpc.addQueueOp({ action: 'reopen', number: num }) }
    catch (error) { state.setError((error as Error).message) }
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
      run: () => { state.filters.kind = 'issue' },
    },
    {
      id: 'tab.pulls',
      keys: ['p'],
      description: 'Pull requests tab',
      enabled: () => !searching.value,
      run: () => { state.filters.kind = 'pull' },
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
      enabled: () => hasToken.value && !state.syncing.value,
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
      enabled: () => hasToken.value && upCount.value > 0 && !state.executing.value,
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
      enabled: () => ui.helpOpen.value || state.queueOpen.value || state.executeConfirmOpen.value,
      run: () => {
        if (ui.helpOpen.value) {
          ui.helpOpen.value = false
          return
        }
        if (state.executeConfirmOpen.value) {
          state.executeConfirmOpen.value = false
          return
        }
        if (state.queueOpen.value) state.closeQueue()
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
  ]
}
