export type PanelId = 'list' | 'detail'

const activePanel = ref<PanelId>('list')

export function useActivePanel() {
  return {
    activePanel,
    setPanel(id: PanelId) {
      activePanel.value = id
    },
  }
}

/** Scroll the detail panel's scroll container by `delta` pixels (smooth). */
export function scrollDetail(delta: number): void {
  if (typeof document === 'undefined')
    return
  const el = document.querySelector<HTMLElement>('[data-scroll="detail"]')
  if (!el)
    return
  el.scrollBy({ top: delta, behavior: 'smooth' })
}
