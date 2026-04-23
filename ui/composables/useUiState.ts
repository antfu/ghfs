import type { UiState } from '#ghfs/server-types'
import { useDebounceFn } from '@vueuse/core'
import { log } from '../utils/logger'

type PrTabId = 'conversation' | 'commits' | 'changes'

const uiState = reactive<UiState>({ drafts: {} })
let hydrated = false
let saveFn: (() => void) | null = null

function ensureSaver() {
  if (saveFn)
    return saveFn
  const rpc = useRpc()
  saveFn = useDebounceFn(() => {
    if (!hydrated)
      return
    rpc.saveUiState({
      drafts: { ...uiState.drafts },
      listPaneSize: uiState.listPaneSize,
      lastPrTab: uiState.lastPrTab,
    }).catch((error) => {
      log.GHFS_E0900({ detail: String((error as Error)?.message ?? error) }, { cause: error }).error()
    })
  }, 700)
  return saveFn
}

function normalizePrTab(value: unknown): PrTabId | undefined {
  if (value === 'conversation' || value === 'commits' || value === 'changes')
    return value
  return undefined
}

export function useUiState() {
  function hydrate(next: UiState | null | undefined) {
    const drafts = next && typeof next === 'object' && next.drafts && typeof next.drafts === 'object'
      ? { ...next.drafts }
      : {}
    uiState.drafts = drafts
    uiState.listPaneSize = typeof next?.listPaneSize === 'number' ? next.listPaneSize : undefined
    uiState.lastPrTab = normalizePrTab(next?.lastPrTab)
    hydrated = true
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

  return {
    uiState,
    hydrate,
    getDraft,
    setDraft,
    clearDraft,
    setListPaneSize,
    setLastPrTab,
  }
}
