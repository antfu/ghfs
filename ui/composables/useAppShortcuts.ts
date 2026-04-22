import type { Shortcut } from './useShortcuts'

export function createAppShortcuts(): Shortcut[] {
  const state = useAppState()
  const rpc = useRpc()
  const isDark = useDark()
  const { filteredEntries } = useFilteredItems()

  const activeItem = computed(() => {
    const num = state.selectedNumber.value
    if (num == null) return null
    return state.payload.value?.syncState.items[String(num)]?.data.item ?? null
  })
  const searching = computed(() => state.filters.search.trim().length > 0)
  const hasToken = computed(() => state.payload.value?.repo.hasToken ?? false)
  const upCount = computed(() => state.payload.value?.queue.upCount ?? 0)
  const hasEntries = computed(() => filteredEntries.value.length > 0)

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
  async function runQueue() {
    if (state.executing.value) return
    if (upCount.value === 0) return
    state.setExecuting(true)
    state.setError(null)
    try {
      await rpc.executeQueue({ continueOnError: true })
    }
    catch (error) {
      state.setError(`Execute failed: ${(error as Error).message}`)
      state.setExecuting(false)
    }
  }
  function toggleQueue() {
    if (state.queueOpen.value) state.closeQueue()
    else state.openQueue()
  }
  async function queueClose() {
    const num = activeItem.value?.number
    if (num == null) return
    try { await rpc.addQueueOp({ action: 'close', number: num }) }
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
      id: 'list.next',
      keys: ['j'],
      description: 'Next item',
      enabled: () => hasEntries.value,
      run: () => moveFocus(1),
    },
    {
      id: 'list.prev',
      keys: ['k'],
      description: 'Previous item',
      enabled: () => hasEntries.value,
      run: () => moveFocus(-1),
    },
    {
      id: 'list.next-arrow',
      keys: ['ArrowDown'],
      description: 'Next item',
      enabled: () => hasEntries.value,
      run: () => moveFocus(1),
    },
    {
      id: 'list.prev-arrow',
      keys: ['ArrowUp'],
      description: 'Previous item',
      enabled: () => hasEntries.value,
      run: () => moveFocus(-1),
    },
    {
      id: 'list.first',
      keys: ['g', 'g'],
      description: 'First item',
      enabled: () => hasEntries.value,
      run: focusFirst,
    },
    {
      id: 'list.last',
      keys: ['G'],
      description: 'Last item',
      enabled: () => hasEntries.value,
      run: focusLast,
    },
    {
      id: 'list.open',
      keys: ['Enter'],
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
      run: runQueue,
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
      description: 'Close queue',
      enabled: () => state.queueOpen.value,
      run: () => {
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
  ]
}
