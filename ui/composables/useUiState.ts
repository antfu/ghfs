import type { UiState } from '#ghfs/server-types'
import { useDebounceFn } from '@vueuse/core'

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
    rpc.saveUiState({ drafts: { ...uiState.drafts }, listPaneSize: uiState.listPaneSize }).catch((error) => {
      console.error('[useUiState] saveUiState failed:', error)
    })
  }, 700)
  return saveFn
}

export function useUiState() {
  function hydrate(next: UiState | null | undefined) {
    const drafts = next && typeof next === 'object' && next.drafts && typeof next.drafts === 'object'
      ? { ...next.drafts }
      : {}
    uiState.drafts = drafts
    uiState.listPaneSize = typeof next?.listPaneSize === 'number' ? next.listPaneSize : undefined
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

  return {
    uiState,
    hydrate,
    getDraft,
    setDraft,
    clearDraft,
    setListPaneSize,
  }
}
