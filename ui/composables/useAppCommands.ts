import type { Command } from './useCommands'

const SCROLL_STEP = 120

function scrollDetail(delta: number): void {
  if (typeof document === 'undefined')
    return
  const el = document.querySelector<HTMLElement>('[data-scroll="detail"]')
  if (!el)
    return
  el.scrollBy({ top: delta, behavior: 'smooth' })
}

function navigateComment(delta: number): void {
  if (typeof document === 'undefined')
    return
  const container = document.querySelector<HTMLElement>('[data-scroll="detail"]')
  if (!container)
    return
  const comments = Array.from(container.querySelectorAll<HTMLElement>('[data-comment-id]'))
  if (comments.length === 0)
    return
  const containerTop = container.getBoundingClientRect().top
  // "Current" comment = last one whose top is at or above the container top
  // (with a small 8px threshold). When scrolled above the first comment,
  // currentIdx stays -1 so moving down lands on index 0.
  let currentIdx = -1
  for (let i = 0; i < comments.length; i++) {
    const top = comments[i]!.getBoundingClientRect().top - containerTop
    if (top <= 8)
      currentIdx = i
    else
      break
  }
  let targetIdx: number
  if (delta > 0)
    targetIdx = currentIdx < 0 ? 0 : Math.min(comments.length - 1, currentIdx + delta)
  else if (currentIdx < 0)
    return
  else
    targetIdx = Math.max(0, currentIdx + delta)
  if (targetIdx === currentIdx)
    return
  const target = comments[targetIdx]!
  const offset = target.getBoundingClientRect().top - containerTop
  container.scrollBy({ top: offset - 8, behavior: 'smooth' })
}

export function createAppCommands(): Command[] {
  const activeId = useActiveProjectId()
  // Resolve state lazily so commands always operate on the *currently*
  // active project's bucket, not the one captured at install time.
  const state = computed(() => useAppState(activeId.value ?? undefined))
  const rpc = useProjectRpc(() => activeId.value ?? '__default__')
  const isDark = useDark()
  const ui = useUiState()
  const hub = useHubState()
  const hubUi = useHubUiState()
  const router = useRouter()
  const { filteredItems } = useFilteredItems()
  const { upCount } = useQueue()
  const palette = useCommandPalette()

  function focusFirstHubCard(): void {
    const first = document.querySelector<HTMLButtonElement>('[data-testid="hub-project-card"]')
    first?.focus()
  }

  const activeItem = computed(() => {
    const num = state.value.selectedNumber.value
    if (num == null) return null
    return state.value.payload.value?.syncState.items[String(num)]?.data.item ?? null
  })

  const route = useRoute()
  const recent = useHubRecent()
  const { filteredItems: recentFilteredItems } = useRecentFiltered()
  const isRecentRoute = computed(() => route.path === '/recent')

  function moveFocus(delta: number) {
    if (isRecentRoute.value) {
      const list = recentFilteredItems.value
      if (!list.length)
        return
      const currentIdx = recent.selectedKey.value == null
        ? -1
        : list.findIndex(it => it.key === recent.selectedKey.value)
      const nextIdx = currentIdx < 0
        ? (delta > 0 ? 0 : list.length - 1)
        : Math.max(0, Math.min(list.length - 1, currentIdx + delta))
      const target = list[nextIdx]
      if (target) void recent.selectItem(target)
      return
    }
    const entries = filteredItems.value
    if (!entries.length)
      return
    const current = state.value.selectedNumber.value == null
      ? -1
      : entries.findIndex(e => e.number === state.value.selectedNumber.value)
    const next = current < 0
      ? (delta > 0 ? 0 : entries.length - 1)
      : Math.max(0, Math.min(entries.length - 1, current + delta))
    const target = entries[next]
    if (target) state.value.selectItem(target.number)
  }
  function focusFirst() {
    if (isRecentRoute.value) {
      const first = recentFilteredItems.value[0]
      if (first) void recent.selectItem(first)
      return
    }
    const first = filteredItems.value[0]
    if (first) state.value.selectItem(first.number)
  }
  function focusLast() {
    if (isRecentRoute.value) {
      const list = recentFilteredItems.value
      const last = list[list.length - 1]
      if (last) void recent.selectItem(last)
      return
    }
    const last = filteredItems.value[filteredItems.value.length - 1]
    if (last) state.value.selectItem(last.number)
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

  function closeTopOverlay() {
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
  }

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
      router.push(`/${next.repo}`)
  }

  return [
    // ─── Palette ────────────────────────────────────────────────────────
    {
      id: 'palette.open',
      title: 'Open command palette',
      category: 'Palette',
      icon: 'i-ph-magnifying-glass-duotone',
      keybindings: [
        { key: 'mod+k' },
        { key: 'mod+shift+p' },
      ],
      when: '!paletteOpen',
      run: () => palette.open(),
    },

    // ─── Navigate ───────────────────────────────────────────────────────
    {
      id: 'nav.down',
      title: 'Next item',
      category: 'Navigate',
      keybindings: ['j'],
      when: 'hasEntries',
      run: () => moveFocus(1),
    },
    {
      id: 'nav.up',
      title: 'Previous item',
      category: 'Navigate',
      keybindings: ['k'],
      when: 'hasEntries',
      run: () => moveFocus(-1),
    },
    {
      id: 'nav.next-tab',
      title: 'Next item (Tab)',
      category: 'Navigate',
      keybindings: [{ key: 'Tab', label: ['Tab'] }],
      when: 'hasEntries',
      run: () => moveFocus(1),
    },
    {
      id: 'nav.prev-tab',
      title: 'Previous item (Shift+Tab)',
      category: 'Navigate',
      keybindings: [{ key: 'shift+Tab', label: ['⇧', 'Tab'] }],
      when: 'hasEntries',
      run: () => moveFocus(-1),
    },
    {
      id: 'detail.scroll-down',
      title: 'Scroll detail down',
      category: 'Navigate',
      keybindings: ['ArrowDown'],
      run: () => scrollDetail(SCROLL_STEP),
    },
    {
      id: 'detail.scroll-up',
      title: 'Scroll detail up',
      category: 'Navigate',
      keybindings: ['ArrowUp'],
      run: () => scrollDetail(-SCROLL_STEP),
    },
    {
      id: 'comment.next',
      title: 'Next comment',
      category: 'Navigate',
      keybindings: ['J'],
      when: 'hasActiveItem',
      run: () => navigateComment(1),
    },
    {
      id: 'comment.prev',
      title: 'Previous comment',
      category: 'Navigate',
      keybindings: ['K'],
      when: 'hasActiveItem',
      run: () => navigateComment(-1),
    },

    // ─── List ───────────────────────────────────────────────────────────
    {
      id: 'list.first',
      title: 'First item',
      category: 'List',
      keybindings: ['g g'],
      when: 'hasEntries',
      run: focusFirst,
    },
    {
      id: 'list.last',
      title: 'Last item',
      category: 'List',
      keybindings: ['G'],
      when: 'hasEntries',
      run: focusLast,
    },
    {
      id: 'list.open',
      title: 'Open on GitHub',
      category: 'List',
      icon: 'i-octicon-link-external-16',
      keybindings: ['g'],
      when: 'hasActiveItem',
      run: () => {
        const url = activeItem.value?.url
        if (url) window.open(url, '_blank', 'noreferrer')
      },
    },

    // ─── Tabs ───────────────────────────────────────────────────────────
    {
      id: 'tab.issues',
      title: 'Issues tab',
      category: 'Tabs',
      icon: 'i-octicon-issue-opened-16',
      keybindings: ['i'],
      when: '!searching',
      run: () => { state.value.filters.kind = 'issue' },
    },
    {
      id: 'tab.pulls',
      title: 'Pull requests tab',
      category: 'Tabs',
      icon: 'i-octicon-git-pull-request-16',
      keybindings: ['p'],
      when: '!searching',
      run: () => { state.value.filters.kind = 'pull' },
    },

    // ─── Search ─────────────────────────────────────────────────────────
    {
      id: 'search.focus',
      title: 'Focus search',
      category: 'Search',
      icon: 'i-octicon-search-16',
      keybindings: ['/'],
      run: focusSearch,
    },

    // ─── Action ─────────────────────────────────────────────────────────
    {
      id: 'action.sync',
      title: 'Sync from GitHub',
      category: 'Action',
      icon: 'i-octicon-sync-16',
      keybindings: ['s'],
      when: 'hasToken && !syncing',
      run: triggerSync,
    },
    {
      id: 'action.queue',
      title: 'Toggle queue',
      category: 'Action',
      icon: 'i-octicon-checklist-16',
      keybindings: ['q'],
      run: toggleQueue,
    },
    {
      id: 'action.execute',
      title: 'Execute queue',
      category: 'Action',
      icon: 'i-octicon-play-16',
      keybindings: ['x'],
      when: 'hasToken && queueUpCount > 0 && !executing',
      run: askExecute,
    },
    {
      id: 'action.theme',
      title: 'Toggle theme',
      category: 'Action',
      icon: 'i-ph-circle-half-tilt-duotone',
      keybindings: ['d'],
      run: () => { isDark.value = !isDark.value },
    },

    // ─── Item ───────────────────────────────────────────────────────────
    {
      id: 'item.close',
      title: 'Queue: Close item',
      category: 'Item',
      icon: 'i-octicon-issue-closed-16',
      keybindings: ['c'],
      when: 'hasActiveItem && activeItemState == "open"',
      run: queueClose,
    },
    {
      id: 'item.reopen',
      title: 'Queue: Reopen item',
      category: 'Item',
      icon: 'i-octicon-issue-reopened-16',
      keybindings: ['r'],
      when: 'hasActiveItem && activeItemState == "closed"',
      run: queueReopen,
    },
    {
      id: 'item.labels',
      title: 'Edit labels',
      category: 'Item',
      icon: 'i-octicon-tag-16',
      keybindings: ['l'],
      when: 'hasActiveItem',
      run: () => { ui.labelEditorOpen.value = true },
    },
    {
      id: 'comment.focus',
      title: 'Focus comment',
      category: 'Item',
      icon: 'i-octicon-comment-16',
      keybindings: ['n'],
      when: 'hasActiveItem',
      run: focusComment,
    },

    // ─── PR detail tabs ─────────────────────────────────────────────────
    {
      id: 'pr.tab.conversation',
      title: 'PR: Conversation tab',
      category: 'PR detail',
      keybindings: ['v'],
      when: 'activeItemKind == "pull"',
      run: () => ui.setLastPrTab('conversation'),
    },
    {
      id: 'pr.tab.commits',
      title: 'PR: Commits tab',
      category: 'PR detail',
      keybindings: ['m'],
      when: 'activeItemKind == "pull"',
      run: () => ui.setLastPrTab('commits'),
    },
    {
      id: 'pr.tab.changes',
      title: 'PR: Changes tab',
      category: 'PR detail',
      keybindings: ['f'],
      when: 'activeItemKind == "pull"',
      run: () => ui.setLastPrTab('changes'),
    },

    // ─── Overlays ───────────────────────────────────────────────────────
    {
      id: 'panel.close',
      title: 'Close overlay',
      category: 'Overlay',
      keybindings: ['Escape'],
      when: 'anyOverlayOpen',
      run: closeTopOverlay,
    },
    {
      id: 'help.open',
      title: 'Show keyboard shortcuts',
      category: 'Help',
      icon: 'i-ph-question-duotone',
      keybindings: ['?'],
      run: () => { ui.helpOpen.value = true },
    },
    {
      id: 'settings.open',
      title: 'Open settings',
      category: 'Help',
      icon: 'i-ph-gear-duotone',
      keybindings: [','],
      when: '!hubSettingsOpen',
      run: () => hubUi.openSettings(),
    },

    // ─── Hub ────────────────────────────────────────────────────────────
    {
      id: 'hub.recent',
      title: 'Hub: Recent activity',
      category: 'Hub',
      icon: 'i-ph-clock-counter-clockwise-duotone',
      keybindings: ['u'],
      when: 'hubMode && route != "/recent"',
      help: 'hubMode',
      run: () => { router.push('/recent') },
    },
    {
      id: 'hub.queue-page',
      title: 'Hub: Open queue page',
      category: 'Hub',
      icon: 'i-octicon-checklist-16',
      keybindings: ['Q'],
      when: 'hubMode && route != "/queue"',
      help: 'hubMode',
      run: () => { router.push('/queue') },
    },
    {
      id: 'hub.prev-project',
      title: 'Hub: Previous project',
      category: 'Hub',
      keybindings: ['['],
      when: 'hubMode && hubProjectsCount > 1 && hasActiveProjectId && route != "/recent"',
      help: 'hubMode',
      run: () => navigateProject(-1),
    },
    {
      id: 'hub.next-project',
      title: 'Hub: Next project',
      category: 'Hub',
      keybindings: [']'],
      when: 'hubMode && hubProjectsCount > 1 && hasActiveProjectId && route != "/recent"',
      help: 'hubMode',
      run: () => navigateProject(1),
    },
    {
      id: 'hub.back',
      title: 'Hub: Back to home',
      category: 'Hub',
      icon: 'i-ph-arrow-left-duotone',
      keybindings: ['b'],
      when: 'hubMode && hasActiveProjectId',
      help: 'hubMode',
      run: () => { router.push('/') },
    },
    {
      id: 'hub.sync-all',
      title: 'Hub: Sync all projects',
      category: 'Hub',
      icon: 'i-octicon-sync-16',
      keybindings: ['s'],
      when: 'hubHome && hasSyncableProjects && !syncingAll',
      help: 'hubMode',
      run: () => { syncAllProjects() },
    },
    {
      id: 'hub.manage',
      title: 'Hub: Manage projects',
      category: 'Hub',
      icon: 'i-ph-folder-duotone',
      keybindings: ['m'],
      when: 'hubHome && !hubPickerOpen',
      help: 'hubMode',
      run: () => hubUi.openPicker(),
    },
    {
      id: 'hub.focus-first',
      title: 'Hub: Focus first project card',
      category: 'Hub',
      keybindings: ['j'],
      when: 'hubHome && hubProjectsCount > 0',
      help: 'hubMode',
      run: focusFirstHubCard,
    },
  ]
}
