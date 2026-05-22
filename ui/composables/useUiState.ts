import type { UiState, UserOverride } from '#ghfs/server-types'
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
    rpc.saveUiState(activeProjectId, {
      drafts: { ...uiState.drafts },
      listPaneSize: uiState.listPaneSize,
      lastPrTab: uiState.lastPrTab,
      userOverride: uiState.userOverride ? { ...uiState.userOverride } : undefined,
      autoSyncIntervalMs: uiState.autoSyncIntervalMs,
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
  }
}
