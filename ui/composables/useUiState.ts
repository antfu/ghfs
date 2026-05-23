import type { SeenEntry, UiState, UserOverride } from '#ghfs/server-types'
import { useDebounceFn } from '@vueuse/core'
import { diagnostics } from '../utils/logger'

type PrTabId = 'conversation' | 'commits' | 'changes'

const uiState = reactive<UiState>({ drafts: {} })
const helpOpen = ref(false)
const labelEditorOpen = ref(false)
let hydrated = false
let saveFn: (() => void) | null = null
let activeProjectId: string | null = null

function ensureSaver(): () => void {
  if (saveFn)
    return saveFn
  const rpc = useRpc()
  const fn = useDebounceFn(() => {
    if (!hydrated || !activeProjectId)
      return
    rpc.$call('ghfs:save-ui-state', activeProjectId, {
      drafts: { ...uiState.drafts },
      listPaneSize: uiState.listPaneSize,
      lastPrTab: uiState.lastPrTab,
      userOverride: uiState.userOverride ? { ...uiState.userOverride } : undefined,
      autoSyncIntervalMs: uiState.autoSyncIntervalMs,
      todos: uiState.todos ? [...uiState.todos] : undefined,
      ignored: uiState.ignored ? [...uiState.ignored] : undefined,
      seenHistory: uiState.seenHistory ? { ...uiState.seenHistory } : undefined,
    }).catch((error) => {
      diagnostics.GHFS0900({ detail: String((error as Error)?.message ?? error), cause: error })
    })
  }, 700)
  saveFn = fn
  return fn
}

function normalizePrTab(value: unknown): PrTabId | undefined {
  if (value === 'conversation' || value === 'commits' || value === 'changes')
    return value
  return undefined
}

function normalizeUserOverride(value: UserOverride | undefined): UserOverride | undefined {
  if (!value || typeof value !== 'object')
    return undefined
  const out: UserOverride = {}
  if (typeof value.login === 'string' && value.login.trim())
    out.login = value.login.trim()
  if (typeof value.name === 'string' && value.name.trim())
    out.name = value.name.trim()
  if (typeof value.avatarUrl === 'string' && value.avatarUrl.startsWith('https://'))
    out.avatarUrl = value.avatarUrl.trim()
  return Object.keys(out).length > 0 ? out : undefined
}

export function useUiState() {
  function hydrate(projectId: string, next: UiState | null | undefined) {
    activeProjectId = projectId
    const drafts = next && typeof next === 'object' && next.drafts && typeof next.drafts === 'object'
      ? { ...next.drafts }
      : {}
    uiState.drafts = drafts
    uiState.listPaneSize = typeof next?.listPaneSize === 'number' ? next.listPaneSize : undefined
    uiState.lastPrTab = normalizePrTab(next?.lastPrTab)
    uiState.userOverride = normalizeUserOverride(next?.userOverride)
    uiState.autoSyncIntervalMs = typeof next?.autoSyncIntervalMs === 'number' ? next.autoSyncIntervalMs : undefined
    uiState.todos = Array.isArray(next?.todos) ? [...next.todos] : undefined
    uiState.ignored = Array.isArray(next?.ignored) ? [...next.ignored] : undefined
    uiState.seenHistory = next?.seenHistory && typeof next.seenHistory === 'object'
      ? { ...next.seenHistory }
      : undefined
    hydrated = true
  }

  function setUserOverride(next: UserOverride | null): void {
    const normalized = next ? normalizeUserOverride(next) : undefined
    uiState.userOverride = normalized
    ensureSaver()()
  }

  function getDraft(number: number | string | null | undefined): string {
    if (number == null)
      return ''
    return uiState.drafts[String(number)] ?? ''
  }

  function setDraft(number: number, body: string): void {
    const key = String(number)
    if (body === '') {
      if (!(key in uiState.drafts))
        return
      delete uiState.drafts[key]
    }
    else if (uiState.drafts[key] === body) {
      return
    }
    else {
      uiState.drafts[key] = body
    }
    ensureSaver()()
  }

  function clearDraft(number: number): void {
    setDraft(number, '')
  }

  function setListPaneSize(size: number): void {
    const rounded = Math.round(size * 10) / 10
    if (uiState.listPaneSize === rounded)
      return
    uiState.listPaneSize = rounded
    ensureSaver()()
  }

  function setLastPrTab(tab: PrTabId): void {
    if (uiState.lastPrTab === tab)
      return
    uiState.lastPrTab = tab
    ensureSaver()()
  }

  function setAutoSyncIntervalMs(value: number | undefined): void {
    const normalized = typeof value === 'number' && value >= 60_000 && value <= 3_600_000
      ? Math.round(value)
      : undefined
    if (uiState.autoSyncIntervalMs === normalized)
      return
    uiState.autoSyncIntervalMs = normalized
    ensureSaver()()
  }

  function getTodos(): number[] {
    return uiState.todos ?? []
  }

  function isTodo(number: number | null | undefined): boolean {
    if (number == null)
      return false
    return uiState.todos?.includes(number) ?? false
  }

  function addTodo(number: number): void {
    if (!Number.isInteger(number) || number <= 0)
      return
    const list = uiState.todos ? [...uiState.todos] : []
    if (list.includes(number))
      return
    list.push(number)
    uiState.todos = list
    ensureSaver()()
  }

  function removeTodo(number: number): void {
    const list = uiState.todos
    if (!list || !list.includes(number))
      return
    uiState.todos = list.filter(n => n !== number)
    ensureSaver()()
  }

  function getIgnored(): number[] {
    return uiState.ignored ?? []
  }

  function isIgnored(number: number | null | undefined): boolean {
    if (number == null)
      return false
    return uiState.ignored?.includes(number) ?? false
  }

  function addIgnored(number: number): void {
    if (!Number.isInteger(number) || number <= 0)
      return
    const list = uiState.ignored ? [...uiState.ignored] : []
    if (list.includes(number))
      return
    list.push(number)
    uiState.ignored = list
    ensureSaver()()
  }

  function removeIgnored(number: number): void {
    const list = uiState.ignored
    if (!list || !list.includes(number))
      return
    uiState.ignored = list.filter(n => n !== number)
    ensureSaver()()
  }

  function getSeenEntry(key: string): SeenEntry | undefined {
    return uiState.seenHistory?.[key]
  }

  function markSeen(key: string, entry: SeenEntry): void {
    if (!key || !entry?.lastSeenAt)
      return
    const current = uiState.seenHistory ?? {}
    const prev = current[key]
    if (prev && prev.lastCommentId === entry.lastCommentId && prev.lastSeenAt === entry.lastSeenAt)
      return
    uiState.seenHistory = { ...current, [key]: entry }
    ensureSaver()()
  }

  return {
    uiState,
    helpOpen,
    labelEditorOpen,
    hydrate,
    getDraft,
    setDraft,
    clearDraft,
    setListPaneSize,
    setLastPrTab,
    setUserOverride,
    setAutoSyncIntervalMs,
    getTodos,
    isTodo,
    addTodo,
    removeTodo,
    getIgnored,
    isIgnored,
    addIgnored,
    removeIgnored,
    getSeenEntry,
    markSeen,
  }
}
